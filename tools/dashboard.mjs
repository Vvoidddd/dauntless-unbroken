import http from 'node:http';
import os from 'node:os';
import { readFile, open, lstat } from 'node:fs/promises';
import { timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, isAbsolute } from 'node:path';
import { readPerformance } from './dashboard-performance.mjs';
import { fleetSummary } from './dashboard-fleet.mjs';
import { monitorWorker } from './dashboard-worker.mjs';
import { drainStatus, startDrain, stopDrain } from './dashboard-maintenance.mjs';
import { drainFleet } from './dashboard-fleet-control.mjs';

export async function readFleetControls(file, reader = readFile) {
  if (file === null || file === undefined || file === '') return [];
  if (typeof file !== 'string' || !isAbsolute(file)) throw new Error('Fleet control configuration must be an absolute path');
  const value = JSON.parse(await reader(file, 'utf8'));
  if (!Array.isArray(value) || value.length > 16) throw new Error('Invalid fleet control configuration');
  const names = new Set();
  return Promise.all(value.map(async entry => {
    if (!entry || typeof entry.name !== 'string' || !entry.name || names.has(entry.name) || typeof entry.url !== 'string' || typeof entry.keyFile !== 'string' || !isAbsolute(entry.keyFile)) throw new Error('Invalid fleet control configuration');
    const target = new URL(entry.url);
    if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || !target.port || target.username || target.password || target.pathname !== '/' || target.search || target.hash) throw new Error('Invalid fleet control configuration');
    names.add(entry.name);
    const key = (await reader(entry.keyFile, 'utf8')).trim();
    if (key.length < 32) throw new Error('Invalid fleet control configuration');
    return {name: entry.name, url: entry.url, key};
  }));
}

export function scrubLog(text) {
  return text.split(/\r?\n/).slice(-150).map(line => {
    // Omit whole credential-bearing lines, including structured request captures.
    if (/token|password|secret|authorization|api.?key|exchange_code|UUK_|eyJ|cookie/i.test(line)) return '[credential-bearing line omitted]';
    return line.replace(/\x1b\[[0-9;]*m/g, '').slice(0, 2000);
  }).join('\n');
}

export async function tailLog(path) {
  if ((await lstat(path)).isSymbolicLink()) throw new Error('Log links are not supported');
  const file = await open(path, 'r');
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error('Not a log file');
    const size = Math.min(stat.size, 32768);
    const buffer = Buffer.alloc(size);
    const { bytesRead } = await file.read(buffer, 0, size, stat.size - size);
    let text = buffer.subarray(0, bytesRead).toString('utf8');
    if (stat.size > size) text = text.slice(text.indexOf('\n') + 1);
    return scrubLog(text);
  } finally { await file.close(); }
}

const digest = value => createHash('sha256').update(value).digest();
const cpuTimes = () => os.cpus().reduce((sum, cpu) => {
  sum.idle += cpu.times.idle;
  sum.total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
  return sum;
}, {idle: 0, total: 0});

export async function startDashboard({key, backend, port = 61110, logs = {}, serverConfig = null, performanceDir = null, fleetUrl = null, fleetKey = key, workerUrl = null, ausUrl = null, germanyUrl = null, eu2Url = null, drainFile = null, fleetControls = [], liveStatusFile = null, previewMode = false, fetcher = fetch}) {
  if (typeof key !== 'string' || key.length < 16) throw new Error('An owner key of at least 16 characters is required');
  if (drainFile !== null && (typeof drainFile !== 'string' || !isAbsolute(drainFile))) throw new Error('Drain file must be an absolute path');
  const target = new URL(backend);
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.username || target.password) throw new Error('Backend must be loopback HTTP');
  const fleetTarget = fleetUrl ? new URL(fleetUrl) : null;
  if (fleetTarget && (fleetTarget.protocol !== 'http:' || fleetTarget.hostname !== '127.0.0.1' || fleetTarget.username || fleetTarget.password || fleetTarget.pathname !== '/' || fleetTarget.search || fleetTarget.hash || Number(fleetTarget.port) === port)) throw new Error('Fleet source must be a different loopback HTTP listener');
  const rawPage = await readFile(new URL('./dashboard.html', import.meta.url), 'utf8');
  const page = previewMode ? rawPage.replace('<main>', '<main><p class="card" role="status">Local test preview: live status is read-only. All controls use simulated hosts.</p>') : rawPage;
  const testRealm = serverConfig?.Mode === 'Local1105' && /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$/.test(serverConfig?.PublicHost || '') && serverConfig?.Ports?.gateway === 62002;
  if (serverConfig && !testRealm && (serverConfig.Mode !== 'Public' || !/^[a-z0-9.-]+$/i.test(serverConfig.PublicHost || '') || !Number.isInteger(serverConfig.Ports?.gateway) || serverConfig.Ports.gateway < 1 || serverConfig.Ports.gateway > 65535 || !/^[a-f0-9]{64}$/i.test(serverConfig.CertFingerprint || ''))) throw new Error('Invalid server configuration');
  const [workerMonitor,ausMonitor,germanyMonitor,eu2Monitor] = await Promise.all([monitorWorker(workerUrl,'Server #2',fetcher),monitorWorker(ausUrl,'Server #3',fetcher),monitorWorker(germanyUrl,'Server #4',fetcher),monitorWorker(eu2Url,'Server #5',fetcher)]);

  let previous = cpuTimes(), known = null, added = 0, sample = null, failure = null, polling = false;
  const history = [];
  let accountCache = null, accountsAt = 0;
  let performanceSample = null, performanceAt = 0;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const started = performance.now();
      const get = async route => {
        const response = await fetcher(new URL(route, target), {headers: {'x-dauntless-unbroken-user-api-key': key}, signal: AbortSignal.timeout(30000), redirect: 'error'});
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Backend rejected the dashboard owner key' : 'Backend HTTP ' + response.status);
        return response.json();
      };
      const [accounts, status, allocation] = await Promise.all([
        accountCache && Date.now() - accountsAt < 60000 ? accountCache : get('/unbroken/api/GetAllUsers'), get('/unbroken/api/ServerStatus'),
        (async () => {
          try {
            const response = await fetcher(new URL(`http://127.0.0.1:${serverConfig?.Ports?.deploy || 61001}/gameservers`), {signal: AbortSignal.timeout(5000), redirect: 'error'});
            if (!response.ok) return null;
            const data = await response.json();
            return {capacity: data.capacity, capacitySampleAt: new Date().toISOString()};
          } catch { return null; }
        })()
      ]);
      let health = null;
      let healthError = null;
      let discord = null;
      try { discord = await get('/unbroken/api/DiscordKeyStats'); } catch { /* Older backends: report unavailable, not zero. */ }
      try { health = await get('/unbroken/api/BackendHealth'); if (!health?.requests) { health = null; healthError = 'Backend returned no health metrics.'; } }
      catch { healthError = 'Backend health disabled or unavailable. Set BACKEND_HEALTH=1 and restart the metagame.'; }
      if (performanceDir && Date.now() - performanceAt >= 15000) {
        performanceAt = Date.now();
        try { performanceSample = await readPerformance(performanceDir); } catch { performanceSample = null; }
      }
      if (!Array.isArray(accounts.Users) || !Array.isArray(status.players) || !Array.isArray(status.instances)) throw new Error('Unexpected backend response');
      if (accounts !== accountCache) { accountCache = accounts; accountsAt = Date.now(); }
      const ids = new Set(accounts.Users.map(user => user.UserId));
      if (known) for (const id of ids) if (!known.has(id)) added++;
      known = ids;
      const current = cpuTimes(), elapsed = current.total - previous.total;
      const cpu = elapsed > 0 ? 100 * (1 - (current.idle - previous.idle) / elapsed) : null;
      previous = current;
      const locations = {city: 0, hunt: 0, dojo: 0, tutorial: 0, menu: 0, unknown: 0};
      for (const player of status.players) locations[Object.hasOwn(locations, player.where) ? player.where : 'unknown']++;
      const point = {at: new Date().toISOString(), cpu, ramUsedMB: (os.totalmem() - os.freemem()) / 1048576, ramTotalMB: os.totalmem() / 1048576, players: status.playersOnline, accounts: ids.size, newAccountsObserved: added, backendMs: performance.now() - started,
        requestsPerSecond: health?.requests?.requestsPerSecond ?? null, errorPercent: health?.requests?.serverErrorPercent ?? null, eventLoopP95Ms: health?.eventLoop?.p95Ms ?? null,
        backendRssMB: health?.memoryMB?.rss ?? null, backendHeapMB: health?.memoryMB?.heapUsed ?? null};
      history.push(point);
      if (history.length > 720) history.shift();
      sample = { ...point, capacity: allocation?.capacity ?? null, capacitySampleAt: allocation?.capacitySampleAt ?? null, players: status.players, instances: status.instances, history, uptimeSeconds: status.uptimeSeconds, hostUptimeSeconds: os.uptime(), dashboardUptimeSeconds: process.uptime(), locations, health, healthError, discord, performance: performanceSample, logicalCpus: os.cpus().length, name: status.name };
      failure = null;
    } catch (error) { failure = (error.name === 'TimeoutError' ? 'Backend response timed out' : /^Backend (HTTP |rejected)/.test(error.message) ? error.message : 'Backend unavailable (connection failed)') + '; last readings are stale.'; }
    finally { polling = false; }
  }
  await poll();
  const timer = setInterval(poll, 5000);
  timer.unref();
  let requests = 0, windowStart = Date.now(), readingLog = false, inviting = false;
  let inviteCount = 0, inviteWindow = Date.now();
  let drainBusy = false;
  let readingAccounts = false;
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(req.headers.host ?? '') || req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.writeHead(403).end(); return; }
    const createInvite = req.method === 'POST' && req.url === '/api/invites';
    const moderate = req.method === 'POST' && req.url === '/api/moderation';
    const accessAction=req.method==='POST' && ['/api/account-access','/api/discord-moderation'].includes(req.url);
    const rewardGrant=req.method==='POST'&&req.url==='/api/reward-grant';
    const supportMutation=req.method==='POST'&&/^\/api\/support-reports\/[0-9a-f-]{36}\/(review|delete)$/i.test(req.url??'');
    const drainMutation = req.method === 'POST' && req.url === '/api/drain';
    const fleetDrainMutation = req.method === 'POST' && req.url === '/api/fleet-drain';
    const announcementMutation = req.method === 'POST' && req.url === '/api/announcement';
    const islandEventMutation = req.method === 'POST' && req.url === '/api/island-event';
    if (req.method !== 'GET' && !createInvite && !moderate && !accessAction && !rewardGrant && !supportMutation && !drainMutation && !fleetDrainMutation && !announcementMutation && !islandEventMutation) { res.writeHead(405).end(); return; }
    if (Date.now() - windowStart > 60000) { requests = 0; windowStart = Date.now(); }
    if (++requests > 300) { res.writeHead(429).end(); return; }
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page); return; }
    if (req.url === '/dashboard.js') { res.setHeader('Content-Type', 'text/javascript; charset=utf-8'); res.end(await readFile(new URL('./dashboard-client.js', import.meta.url))); return; }
    if(req.url==='/dashboard-rewards.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await readFile(new URL('./dashboard-rewards.js',import.meta.url)));return;}
    if(req.url==='/dashboard-support.js'){res.setHeader('Content-Type','text/javascript; charset=utf-8');res.end(await readFile(new URL('./dashboard-support.js',import.meta.url)));return;}
    const supplied = req.headers['x-dashboard-key'];
    if (typeof supplied !== 'string' || !timingSafeEqual(digest(supplied), digest(key))) { res.writeHead(401).end(); return; }
    res.setHeader('Content-Type', 'application/json');
    if(req.method === 'GET' && req.url === '/api/live-hosts'){
      if(!liveStatusFile){res.writeHead(503).end(JSON.stringify({error:'Live status is not configured.'}));return;}
      try{
        const stat=await lstat(liveStatusFile);
        if(!stat.isFile() || stat.isSymbolicLink() || stat.size>16384)throw Error('invalid status');
        const value=JSON.parse(await readFile(liveStatusFile,'utf8'));
        if(!Array.isArray(value.hosts) || value.hosts.length>16 || !Number.isFinite(Date.parse(value.at)))throw Error('invalid status');
        const number=x=>typeof x==='number' && Number.isFinite(x) && x>=0 ? x:null;
        const hosts=value.hosts.map(host=>({name:typeof host.name==='string'?host.name.slice(0,64):'Unknown',online:host.online===true,
          at:typeof host.at==='string'?host.at:null,cpu:number(host.cpu),memoryUsedMB:number(host.memoryUsedMB),memoryTotalMB:number(host.memoryTotalMB),running:number(host.running),pending:number(host.pending),limit:number(host.limit),draining:typeof host.draining==='boolean'?host.draining:null}));
        res.end(JSON.stringify({at:value.at,hosts}));
      }catch{res.writeHead(503).end(JSON.stringify({error:'Live status unavailable.'}));}
      return;
    }
    if(req.url === '/api/island-event'){
      let text = '';
      if(islandEventMutation){
        if(req.headers.origin !== `http://${req.headers.host}`){res.writeHead(403).end();return;}
        if(req.headers['content-type'] !== 'application/json'){res.writeHead(415).end();return;}
        for await(const chunk of req){text+=chunk.toString('utf8');if(Buffer.byteLength(text)>256){res.writeHead(413).end();return;}}
        let body;try{body=JSON.parse(text);}catch{res.writeHead(400).end();return;}
        if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==1 || !['default','off','trials'].includes(body.mode)){res.writeHead(400).end(JSON.stringify({error:'Invalid island event mode.'}));return;}
      }
      try{
        const response=await fetcher(new URL('/unbroken/api/IslandEventControl',target),{method:islandEventMutation?'POST':'GET',headers:{'x-dauntless-unbroken-user-api-key':key,'content-type':'application/json'},...(islandEventMutation?{body:text}:{}),signal:AbortSignal.timeout(10000),redirect:'error'});
        const result = await response.json();
        res.writeHead(response.status).end(JSON.stringify(result));
      }catch{res.writeHead(503).end(JSON.stringify({error:'Island event control unavailable.'}));}
      return;
    }
    if(req.method === 'GET' && req.url === '/api/fleet-drain'){res.end(JSON.stringify({hosts:fleetControls.map(host=>host.name)}));return;}
    if(fleetDrainMutation || announcementMutation){
      if(req.headers.origin !== `http://${req.headers.host}`){res.writeHead(403).end();return;}
      if(req.headers['content-type'] !== 'application/json'){res.writeHead(415).end();return;}
      if(fleetDrainMutation && !fleetControls.length){res.writeHead(503).end(JSON.stringify({error:'Fleet controls are not configured.'}));return;}
      if(fleetDrainMutation && drainBusy){res.writeHead(409).end();return;}
      if(fleetDrainMutation)drainBusy=true;
      try{
        let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(Buffer.byteLength(text)>8192){res.writeHead(413).end();return;}}
        let body;try{body=JSON.parse(text);}catch{res.writeHead(400).end();return;}
        if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).length!==1){res.writeHead(400).end();return;}
        if(fleetDrainMutation){
          if(!['start','stop'].includes(body.action)){res.writeHead(400).end();return;}
          res.end(JSON.stringify({hosts:await drainFleet(body.action,fleetControls,fetcher)}));return;
        }
        if(typeof body.message!=='string' || !body.message.trim() || [...body.message].length>2048 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/.test(body.message)){res.writeHead(400).end();return;}
        const response=await fetcher(new URL('/unbroken/api/Announcement',target),{method:'POST',headers:{'x-dauntless-unbroken-user-api-key':key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000),redirect:'error'});
        if(!response.ok){res.writeHead(response.status===400?400:503).end(JSON.stringify({error:'Announcement unavailable.'}));return;}
        const result=await response.json();if(!Number.isSafeInteger(result.attempted)||result.attempted<0)throw Error('invalid response');
        res.end(JSON.stringify({attempted:result.attempted}));
      }catch{res.writeHead(503).end(JSON.stringify({error:'Result unknown; check before retrying.'}));}
      finally{if(fleetDrainMutation)drainBusy=false;}
      return;
    }
    if(req.url === '/api/drain'){
      if(!drainFile){res.writeHead(503).end(JSON.stringify({error:'Drain control is not configured.'}));return;}
      if(drainMutation && req.headers.origin !== `http://${req.headers.host}`){res.writeHead(403).end();return;}
      if(drainBusy){res.writeHead(409).end(JSON.stringify({error:'Another drain operation is running.'}));return;}
      drainBusy = true;
      try{
        if(!drainMutation){res.end(JSON.stringify({state:await drainStatus(drainFile)}));return;}
        if(req.headers['content-type'] !== 'application/json'){res.writeHead(415).end();return;}
        let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(Buffer.byteLength(text)>256){res.writeHead(413).end();return;}}
        let body;try{body=JSON.parse(text);}catch{res.writeHead(400).end();return;}
        if(!body || Object.keys(body).length !== 1 || !['start','stop'].includes(body.action)){res.writeHead(400).end();return;}
        const state = body.action === 'start' ? await startDrain(drainFile) : await stopDrain(drainFile);
        res.end(JSON.stringify({state}));
      }catch(error){
        if(error.message === 'Drain belongs to another controller') res.writeHead(409).end(JSON.stringify({error:'Drain is controlled elsewhere.'}));
        else res.writeHead(503).end(JSON.stringify({error:'Drain control unavailable.'}));
      }finally{drainBusy = false;}
      return;
    }
    if(req.url==='/api/support-reports'||req.url?.startsWith('/api/support-reports?')||/^\/api\/support-reports\/[0-9a-f-]{36}(\/(?:review|delete))?$/i.test(req.url??'')){
      if(supportMutation&&req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403).end();return;}
      const input=new URL(req.url,'http://localhost'),match=/^\/api\/support-reports\/([0-9a-f-]{36})(\/(?:review|delete))?$/i.exec(input.pathname);
      if(match?.[2]&&!supportMutation){res.writeHead(405).end();return;}
      const endpoint=new URL(match?`/unbroken/api/SupportReports/${match[1]}${match[2]??''}`:'/unbroken/api/SupportReports',target);
      if(!match)endpoint.searchParams.set('q',(input.searchParams.get('q')??'').slice(0,100));
      try{
        const response=await fetcher(endpoint,{method:supportMutation?'POST':'GET',headers:{'x-dauntless-unbroken-user-api-key':key},signal:AbortSignal.timeout(10000),redirect:'error'});
        res.writeHead(response.status).end(JSON.stringify(await response.json()));
      }catch{res.writeHead(503).end(JSON.stringify({error:'Support inbox unavailable'}));}
      return;
    }
    if(rewardGrant||req.url?.startsWith('/api/reward-catalog?')||req.url?.startsWith('/api/reward-account?')){
      try{
        let body,endpoint;
        if(rewardGrant){
          if(req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403).end();return;}
          if(req.headers['content-type']!=='application/json'){res.writeHead(415).end();return;}
          let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(Buffer.byteLength(text)>4096){res.writeHead(413).end();return;}}
          try{body=JSON.parse(text);}catch{res.writeHead(400).end();return;}
          endpoint=new URL('/unbroken/api/RewardGrant',target);
        }else{
          const params=new URL(req.url,'http://localhost').searchParams;
          if(req.url.startsWith('/api/reward-account?')){
            const id=params.get('accountId');if(!/^UID-[A-Za-z0-9-]{1,100}$/.test(id??'')){res.writeHead(400).end();return;}
            endpoint=new URL('/unbroken/api/RewardAccount',target);endpoint.searchParams.set('accountId',id);
          }else{
            const q=params.get('q')??'',category=params.get('category')??'',offset=params.get('offset')??'0';
            if(q.length>100||category.length>30||!/^\d+$/.test(offset)||Number(offset)>100000){res.writeHead(400).end();return;}
            endpoint=new URL('/unbroken/api/RewardCatalog',target);endpoint.searchParams.set('q',q);endpoint.searchParams.set('category',category);endpoint.searchParams.set('offset',offset);
          }
        }
        const response=await fetcher(endpoint,{method:rewardGrant?'POST':'GET',headers:{'x-dauntless-unbroken-user-api-key':key,'content-type':'application/json'},body:rewardGrant?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000),redirect:'error'});
        res.writeHead(response.status).end(JSON.stringify(await response.json()));
      }catch{res.writeHead(503).end(JSON.stringify({error:'Rewards unavailable. Retry the same request.'}));}
      return;
    }
    if(accessAction || req.url?.startsWith('/api/discord-access?') || req.url==='/api/access-log') {
      try {
        let body;
        if(accessAction){
          if(req.headers.origin!==`http://${req.headers.host}`){res.writeHead(403).end();return;}
          if(req.headers['content-type']!=='application/json'){res.writeHead(415).end();return;}
          let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(Buffer.byteLength(text)>4096){res.writeHead(413).end();return;}}
          try{body=JSON.parse(text);}catch{res.writeHead(400).end();return;}
        }
        const id=new URL(req.url,'http://localhost').searchParams.get('discordId');
        if(!accessAction && req.url!=='/api/access-log' && !/^\d{17,20}$/.test(id??'')){res.writeHead(400).end();return;}
        if(accessAction && (!body || typeof body!=='object' || Array.isArray(body))){res.writeHead(400).end();return;}
        if(body)delete body.moderatorId;
        const endpoint=accessAction
          ? new URL(req.url==='/api/account-access'?'/unbroken/api/AccountAccess':'/unbroken/api/DiscordModeration',target)
          : new URL(req.url==='/api/access-log'?'/unbroken/api/AccountAccessLog':'/unbroken/api/DiscordAccess/',target);
        // Request input may change a validated path segment, never the destination origin.
        if(!accessAction && req.url!=='/api/access-log')endpoint.pathname+=id;
        const response=await fetcher(endpoint,{method:accessAction?'POST':'GET',headers:{'x-dauntless-unbroken-user-api-key':key,'content-type':'application/json'},body:accessAction?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000),redirect:'error'});
        res.writeHead(response.status).end(JSON.stringify(await response.json()));
      }catch{res.writeHead(502).end(JSON.stringify({error:'Account access service unavailable. Refresh status before retrying.'}));}
      return;
    }
    if(req.url?.startsWith('/api/moderation-log?')) {
      const query=new URL(req.url,'http://localhost').searchParams;
      const kind=query.get('kind'),offset=Number(query.get('offset')??0);
      if(!['bans','events'].includes(kind)||!Number.isSafeInteger(offset)||offset<0||offset>1000000){res.writeHead(400).end();return;}
      try {
        const response=await fetcher(new URL(`/unbroken/api/ModerationLog?kind=${kind}&offset=${offset}`,target),{headers:{'x-dauntless-unbroken-user-api-key':key},signal:AbortSignal.timeout(30000),redirect:'error'});
        res.writeHead(response.status).end(JSON.stringify(await response.json()));
      }catch{res.writeHead(502).end(JSON.stringify({error:'Moderation history unavailable'}));}
      return;
    }
    if (moderate || req.url?.startsWith('/api/moderation?')) {
      try {
        let body;
        if(moderate){
          if(req.headers.origin !== `http://${req.headers.host}`){res.writeHead(403).end();return;}
          if(req.headers['content-type'] !== 'application/json'){res.writeHead(415).end();return;}
          let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(Buffer.byteLength(text)>2048){res.writeHead(413).end();return;}}
          body=JSON.parse(text);
          // Resolve optional IP scope from trusted backend observations, never from request input.
          body.address=null;
          if(body.active===true){
            body.durationHours??=168;
            if(body.includeIp===true){
              const observed=await fetcher(new URL(`/unbroken/api/Moderation/${encodeURIComponent(body.accountId)}`,target),{headers:{'x-dauntless-unbroken-user-api-key':key},signal:AbortSignal.timeout(30000),redirect:'error'});
              const info=await observed.json();
              if(observed.status!==200 || !info.addresses?.[0]?.address){res.writeHead(409).end(JSON.stringify({error:'No recently observed player IP. Use an account-only ban.'}));return;}
              body.address=info.addresses[0].address;
            }
          }
          delete body.includeIp;
        }
        const id=new URL(req.url,'http://localhost').searchParams.get('accountId');
        if(!moderate && (!id || !/^UID-[A-Za-z0-9-]{1,100}$/.test(id))){res.writeHead(400).end();return;}
        const response=await fetcher(new URL(moderate?'/unbroken/api/Moderation':`/unbroken/api/Moderation/${encodeURIComponent(id)}`,target),{
          method:moderate?'POST':'GET',headers:{'x-dauntless-unbroken-user-api-key':key,'content-type':'application/json'},
          body:moderate?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000),redirect:'error'});
        res.writeHead(response.status).end(JSON.stringify(await response.json()));
      }catch{res.writeHead(502).end(JSON.stringify({error:'Moderation request failed. Refresh status before retrying.'}));}
      return;
    }
    if (req.url?.startsWith('/api/account-key?')) {
      res.setHeader('Cache-Control','no-store');
      const id=new URL(req.url,'http://localhost').searchParams.get('accountId');
      if(!id || !/^UID-[A-Za-z0-9-]{1,100}$/.test(id)){res.writeHead(400).end();return;}
      try {
        const response=await fetcher(new URL(`/unbroken/api/AccountRecovery/${encodeURIComponent(id)}`,target),{headers:{'x-dauntless-unbroken-user-api-key':key},signal:AbortSignal.timeout(30000),redirect:'error'});
        res.writeHead(response.status).end(JSON.stringify(await response.json()));
      } catch {res.writeHead(503).end(JSON.stringify({error:'Account recovery unavailable.'}));}
      return;
    }
    if (req.url?.startsWith('/api/accounts?')) {
      const params=new URL(req.url,'http://localhost').searchParams;
      const query=(params.get('q') || '').trim();
      if(query.length>100){res.writeHead(400).end();return;}
      const offset = params.get('offset');
      if (!/^\d{1,8}$/.test(offset || '') || Number(offset) > 10000000) { res.writeHead(400).end(); return; }
      if (readingAccounts) { res.writeHead(429).end(); return; }
      readingAccounts = true;
      try {
        const response = await fetcher(new URL(`/unbroken/api/DashboardAccounts?offset=${Number(offset)}&q=${encodeURIComponent(query)}`, target), {headers: {'x-dauntless-unbroken-user-api-key': key}, signal: AbortSignal.timeout(30000), redirect: 'error'});
        if (!response.ok) throw new Error('unavailable');
        const result = await response.json();
        if (!Array.isArray(result.accounts)) throw new Error('invalid');
        // Explicit projection prevents future backend fields (especially credentials) leaking.
        res.end(JSON.stringify({accounts: result.accounts.slice(0, 100).map(a => ({id: String(a.id), name: String(a.name), admin: a.admin === true, developer:a.developer===true,discordId:/^\d{17,20}$/.test(a.discordId??'')?a.discordId:null,
          keyFingerprint: /^[a-f0-9]{16}$/.test(a.keyFingerprint || '') ? a.keyFingerprint : null})),
          nextOffset: Number.isSafeInteger(result.nextOffset) && result.nextOffset > Number(offset) && result.nextOffset <= 10000000 ? result.nextOffset : null}));
      } catch { res.writeHead(503).end(JSON.stringify({error: 'Account directory unavailable. Update the metagame if this route is missing.'})); }
      finally { readingAccounts = false; }
      return;
    }
    if (createInvite) {
      if (req.headers.origin !== `http://${req.headers.host}`) { res.writeHead(403).end(); return; }
      if (!serverConfig) { res.writeHead(503).end(JSON.stringify({error: 'Invite generation is not configured.'})); return; }
      if (Date.now() - inviteWindow > 60000) { inviteCount = 0; inviteWindow = Date.now(); }
      if (inviting || inviteCount >= 10) { res.writeHead(429).end(); return; }
      if (req.headers['content-type'] !== 'application/json') { res.writeHead(415).end(); return; }
      inviting = true;
      let submitted = false;
      try {
        let text = '';
        for await (const chunk of req) { text += chunk.toString('utf8'); if (Buffer.byteLength(text) > 2048) { res.writeHead(413).end(); return; } }
        let body;
        try { body = JSON.parse(text); } catch { res.writeHead(400).end(); return; }
        if (!body || (body.discordId!==undefined && (!/^\d{17,20}$/.test(body.discordId)||body.uses!==1)) || !Number.isInteger(body.uses) || body.uses < 1 || body.uses > 100 || typeof body.name !== 'string' || body.name.length > 100 || /[\x00-\x1f]/.test(body.name)) { res.writeHead(400).end(); return; }
        inviteCount++;
        submitted = true;
        const response = await fetcher(new URL(body.discordId?'/unbroken/api/DiscordInvite':'/unbroken/api/CreateInvite', target), {method: 'POST', headers: {'x-dauntless-unbroken-user-api-key': key, 'content-type': 'application/json'}, body: JSON.stringify(body.discordId?{discordId:body.discordId}:{uses: body.uses, name: body.name}), signal: AbortSignal.timeout(15000), redirect: 'error'});
        if (!response.ok) { res.writeHead(response.status === 429 ? 429 : 502).end(JSON.stringify({error: 'Backend refused invite creation.'})); return; }
        const result = await response.json();
        if (!/^[A-Za-z0-9-]{4,64}$/.test(result.code || '')) throw new Error('Invalid invite response');
        if (testRealm) {
          const query = new URLSearchParams({v:'1',host:serverConfig.PublicHost,port:'62002',code:result.code,name:'Dauntless Unbroken 1.10.5 Test'});
          res.end(JSON.stringify({invite:`dauntless-unbroken://join?${query}`,uses:body.uses,realm:serverConfig.PublicHost,gameVersion:'1.10.5'})); return;
        }
        const query = new URLSearchParams({v: '2', mode: 'public', host: serverConfig.PublicHost.toLowerCase(), port: String(serverConfig.Ports.gateway), fp: serverConfig.CertFingerprint.toLowerCase(), code: result.code, name: serverConfig.ServerName || 'Dauntless Unbroken'});
        res.end(JSON.stringify({invite: `dauntless-unbroken://join?${query}`, uses: body.uses}));
      } catch { if (!res.destroyed) res.writeHead(502).end(JSON.stringify({error: submitted ? 'Invite result unknown. It may have been created; do not automatically retry.' : 'Invalid invite request.'})); }
      finally { inviting = false; }
      return;
    }
    if (req.url === '/api/status' && fleetTarget) {
      try {
        const upstream = await fetcher(new URL('/api/status', fleetTarget), {headers:{'x-dashboard-key':fleetKey},signal:AbortSignal.timeout(8000),redirect:'error'});
        if (!upstream.ok) throw new Error('Fleet unavailable');
        const data = await upstream.json();
        if (!Array.isArray(data.fleet?.rows) || data.fleet.rows.length > 16) throw new Error('Invalid fleet');
        res.end(JSON.stringify({...data,logNames:Object.keys(logs),invitesEnabled:!!serverConfig}));
      } catch { res.writeHead(503).end(JSON.stringify({error:'Fleet status unavailable; retry shortly.'})); }
      return;
    }
    if (req.url === '/api/status') { res.end(JSON.stringify({sample, worker:workerMonitor.state, aus:ausMonitor.state, germany:germanyMonitor.state, eu2:eu2Monitor.state, fleet:fleetSummary(sample,workerMonitor.state,failure,Date.now(),ausMonitor.state,germanyMonitor.state,eu2Monitor.state), error: failure, logNames: Object.keys(logs), invitesEnabled: !!serverConfig})); return; }
    if (req.url?.startsWith('/api/log?')) {
      const name = new URL(req.url, 'http://localhost').searchParams.get('name');
      if (!name || !Object.hasOwn(logs, name)) { res.writeHead(404).end(); return; }
      if (readingLog) { res.writeHead(429).end(); return; }
      readingLog = true;
      try { res.end(JSON.stringify({text: await tailLog(logs[name])})); }
      catch { res.writeHead(503).end(JSON.stringify({error: 'Log unavailable'})); }
      finally { readingLog = false; }
      return;
    }
    res.writeHead(404).end();
  });
  server.on('close', () => { clearInterval(timer); workerMonitor.close(); ausMonitor.close(); germanyMonitor.close(); eu2Monitor.close(); });
  server.requestTimeout = 10000;
  try { await new Promise((yes, no) => { server.once('error', no); server.listen(port, '127.0.0.1', yes); }); }
  catch (error) { clearInterval(timer); workerMonitor.close(); ausMonitor.close(); germanyMonitor.close(); eu2Monitor.close(); throw error; }
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  (async () => {
    const key = (await readFile(process.env.DASHBOARD_OWNER_KEY_FILE, 'utf8')).trim();
    const logs = JSON.parse(process.env.DASHBOARD_LOG_CONFIG_FILE ? await readFile(process.env.DASHBOARD_LOG_CONFIG_FILE, 'utf8') : process.env.DASHBOARD_LOG_FILES || '{}');
    if (!logs || Array.isArray(logs) || typeof logs !== 'object' || Object.values(logs).some(path => typeof path !== 'string')) throw new Error('DASHBOARD_LOG_FILES must map labels to file paths');
    const port = Number(process.env.DASHBOARD_PORT || 61110);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid dashboard port');
    const serverConfig = process.env.DASHBOARD_SERVER_CONFIG ? JSON.parse(await readFile(process.env.DASHBOARD_SERVER_CONFIG, 'utf8')) : null;
    const fleetControls = await readFleetControls(process.env.DASHBOARD_FLEET_CONTROL_CONFIG || null);
    await startDashboard({key, backend: process.env.DASHBOARD_BACKEND || 'http://127.0.0.1:61000', port, logs, serverConfig, fleetUrl: process.env.DASHBOARD_FLEET_URL || null, fleetKey: process.env.DASHBOARD_FLEET_KEY_FILE ? (await readFile(process.env.DASHBOARD_FLEET_KEY_FILE,'utf8')).trim() : key, performanceDir: process.env.DASHBOARD_PERFORMANCE_DIR || null, workerUrl: process.env.DASHBOARD_WORKER_URL || null, ausUrl: process.env.DASHBOARD_AUS_URL || null, germanyUrl: process.env.DASHBOARD_GERMANY_URL || null, eu2Url: process.env.DASHBOARD_EU2_URL || null, drainFile: process.env.DASHBOARD_DRAIN_FILE || null, fleetControls, liveStatusFile: process.env.DASHBOARD_LIVE_STATUS_FILE || null});
    console.log(`Owner dashboard: http://127.0.0.1:${port} (use an SSH tunnel remotely)`);
  })().catch(() => { console.error('Dashboard startup failed. Check owner key file, settings and port.'); process.exitCode = 1; });
}
