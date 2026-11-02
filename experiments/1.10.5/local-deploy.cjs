// Isolated test worlds. Only the explicitly ported hunt routes are admitted.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
// Windows PowerShell must load its own modules, not the parent PowerShell 7 modules.
const powershell = path.join(process.env.SystemRoot || 'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const {CityPool,CapacityUnavailable,memoryAdmission,CheckCpuAdmission,HuntsDraining}=require('./bin/fleet.cjs');
const psEnvironment = { ...process.env, PSModulePath: path.join(path.dirname(powershell),'Modules') };
const root = path.resolve(__dirname, '../../..');
const host = process.env.DR_1105_BIND_IP || '127.0.0.1';
if (!require('./realm-proxy.cjs').privateIp(host) && !['127.0.0.1','0.0.0.0'].includes(host)) throw Error('Invalid bind address');
const publicHost=process.env.DR_1105_PUBLIC_HOST||host;
if(require('node:net').isIP(publicHost)!==4||publicHost==='0.0.0.0')throw Error('Set the advertised IPv4 address');
const maxHunts=Number(process.env.DR_1105_MAX_HUNTS||4);
if(!Number.isInteger(maxHunts)||maxHunts<1||maxHunts>64)throw Error('Invalid hunt capacity');
const huntPorts=Array.from({length:maxHunts},(_,i)=>63872+i);
const workerUrl=process.env.DR_1105_WORKER_URL;
if(workerUrl&&!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(workerUrl))throw Error('Worker must use a loopback SSH tunnel');
const worlds = {
  CITY: { stem: 'native-server', port: 63870 },
  SHARED: { stem: 'native-dojo', port: 63871 },
};
const catalog = require('./hunting-grounds.json');
const huntFile = path.join(root, 'backend-state/realm-hunts.json');
const hunts = new Map();
const launching = new Set();
const retiring = new Set();
const emptySince = new Map();
const huntKey = (hunt, players) => `${hunt}_${[...players].sort().join('_')}`;
// ponytail: each party gets its own hunt; shared public island pooling can follow occupancy reservations.
const workerOwns=(hunt,players)=>crypto.createHash('sha256').update(huntKey(hunt,players)).digest()[0]%2===0;
if (require.main === module && fs.existsSync(huntFile)) {
  for (const entry of JSON.parse(fs.readFileSync(huntFile))) {
    if (catalog[entry.hunt] && huntPorts.includes(entry.port) && Array.isArray(entry.players) && entry.players.length) {
      if(entry.hunt === 'Tutorial' && (!Array.isArray(entry.players) || entry.players.length !== 1))continue;
      const key=huntKey(entry.hunt,entry.players);
      hunts.set(key, entry); worlds[key] = { stem: `native-hunt-${entry.port}`, port: entry.port };
    }
  }
}
function saveHunts() { fs.writeFileSync(huntFile, JSON.stringify([...hunts.values()],null,2)); }
function emptyHunt(entry, tail, modified, now=Date.now()) {
  const samples=[...tail.matchAll(/engine_tick[^\r\n]*clients=(\d+)/g)];
  return now-modified < 15000 && now-entry.requestedAt > 90000 && samples.length>0 && samples.at(-1)[1]==='0';
}
let cleaning=false;
async function cleanEmptyHunts() {
  if(cleaning)return;cleaning=true;
  try { for(const [hunt,entry] of hunts) {
    if(launching.has(hunt))continue;
    let live=false;
    try{const pid=Number(fs.readFileSync(path.join(root,`native-hunt-${entry.port}.pid`),'utf8'));if(pid>0){process.kill(pid,0);live=true;}}
    catch(error){if(error.code!=='ENOENT'&&error.code!=='ESRCH')live=true;}
    if(!live&&Date.now()-entry.requestedAt>180000){
      const sockets=await socketSnapshot();
      if(sockets&&!sockets.some(s=>s.LocalPort===entry.port)){
        hunts.delete(hunt);delete worlds[hunt];emptySince.delete(hunt);sessions.delete(hunt);saveHunts();continue;
      }
    }
    const log=path.join(root,`native-hunt-${entry.port}.log`);let stat,tail;
    try {stat=fs.statSync(log);const fd=fs.openSync(log,'r');try{const bytes=Buffer.alloc(Math.min(stat.size,4096));fs.readSync(fd,bytes,0,bytes.length,stat.size-bytes.length);tail=bytes.toString();}finally{fs.closeSync(fd);}}
    catch {continue;}
    if(!emptyHunt(entry,tail,stat.mtimeMs)){emptySince.delete(hunt);continue;}
    if(!emptySince.has(hunt)){emptySince.set(hunt,Date.now());continue;}
    if(Date.now()-emptySince.get(hunt)<90000)continue;
    let pid;try{pid=Number(fs.readFileSync(path.join(root,`native-hunt-${entry.port}.pid`),'utf8'));}catch{continue;}
    if(!Number.isSafeInteger(pid)||pid<=0)continue;
    if(Date.now()-entry.requestedAt<=90000)continue;
    retiring.add(hunt);
    const exe=path.join(root,'game/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe').replaceAll("'","''");
    const stopped=await new Promise(resolve=>execFile(powershell,['-NoProfile','-NonInteractive','-Command',
      `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if (!$p) {'gone'} elseif ($p.ExecutablePath -eq '${exe}' -and $p.CommandLine -match '(^|\\s)-server(\\s|$)' -and $p.CommandLine -match '(^|\\s)-port=${entry.port}(\\s|$)') { Stop-Process -Id ${pid} -ErrorAction Stop; 'stopped' }`],
      {windowsHide:true,timeout:10000,env:psEnvironment},(error,out)=>resolve(!error&&/^(stopped|gone)$/.test(out.trim()))));
    if(stopped){hunts.delete(hunt);delete worlds[hunt];emptySince.delete(hunt);sessions.delete(hunt);saveHunts();console.log(`Closed empty local island: ${hunt}`);}
    retiring.delete(hunt);
  }}finally{cleaning=false;}
}
async function startHunt(hunt, players) {
  const definition=hunt;
  hunt=huntKey(hunt,players);
  if(retiring.has(hunt))return;
  if (!hunts.has(hunt)) {
    if(HuntsDraining())throw new CapacityUnavailable('hunts');
    CheckCpuAdmission();
    if(launching.size>=2)throw new CapacityUnavailable('hunts');
    const release=memoryAdmission.reserve(true);
    const port = huntPorts.find(p => ![...hunts.values()].some(x=>x.port===p));
    if (!port) {release();throw new CapacityUnavailable('ports');}
    hunts.set(hunt,{hunt:definition,players,port,requestedAt:Date.now()});
    worlds[hunt] = {stem:`native-hunt-${port}`,port}; saveHunts(); launching.add(hunt);
    execFile(powershell,['-NoProfile','-NonInteractive','-File',path.join(__dirname,'start-server.ps1'),
      '-World','combat-probe','-BindIp',host,'-Hunt',definition,'-HuntPort',String(port),'-Players',players.join(',')],
      {windowsHide:true,timeout:60000,env:psEnvironment},(error,stdout,stderr)=>{
        launching.delete(hunt);release();
        if(error){console.error(`Hunt startup failed: ${hunt}: ${String(stderr || error.message).slice(0,3000)}`);}
        // A timed-out launcher may have a live child. Keep its port reserved until cleanup proves it exited.
      });
  }
  const entry=hunts.get(hunt); if(entry) {entry.requestedAt=Date.now();saveHunts();}
  return ready(hunt);
}
const sessions = new Map();
const readinessCache=new Map();
let socketCache;
function socketSnapshot(){
  if(socketCache&&Date.now()-socketCache.at<2000)return socketCache.value;
  const value=new Promise(resolve=>execFile(powershell,['-NoProfile','-NonInteractive','-Command',
    '@(Get-NetUDPEndpoint -ErrorAction Stop | Where-Object {$_.LocalPort -ge 63870 -and $_.LocalPort -le 63935} | Select-Object LocalPort,OwningProcess) | ConvertTo-Json -Compress'],
    {windowsHide:true,timeout:8000,env:psEnvironment},(error,out)=>{try{resolve(error?null:[JSON.parse(out||'[]')].flat());}catch{resolve(null);}}));
  socketCache={at:Date.now(),value};return value;
}
function occupancy(stem,startedAt,now=Date.now()){
  const file=path.join(root,stem+'.log');
  try{
    const stat=fs.statSync(file);if(now-stat.mtimeMs>15000||stat.mtimeMs<startedAt)return;
    const fd=fs.openSync(file,'r');let tail;
    try{const b=Buffer.alloc(Math.min(stat.size,8192));fs.readSync(fd,b,0,b.length,stat.size-b.length);tail=b.toString();}finally{fs.closeSync(fd);}
    const sample=[...tail.matchAll(/engine_tick[^\r\n]*clients=(\d+)/g)].at(-1);
    return sample?Number(sample[1]):undefined;
  }catch{return;}
}
async function ready(mode) {
  const cached=readinessCache.get(mode);
  if(cached&&Date.now()-cached.at<2000)return cached.value;
  const value=probeReady(mode);readinessCache.set(mode,{at:Date.now(),value});return value;
}
async function probeReady(mode) {
  if (!worlds[mode] || retiring.has(mode)) return;
  const { stem, port } = worlds[mode];
  let pid;
  try { pid = Number(fs.readFileSync(path.join(root, stem + '.pid'), 'utf8')); } catch { return; }
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  const sockets=await socketSnapshot();
  if(!sockets?.some(s=>s.LocalPort===port&&s.OwningProcess===pid))return;
  if (sessions.get(mode)?.pid !== pid) {
    const stamp=fs.statSync(path.join(root,stem+'.pid')).mtimeMs;
    const h=crypto.createHash('sha256').update(`${publicHost}:${port}:${pid}:${stamp}`).digest('hex');
    sessions.set(mode,{pid,id:`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`});
  }
  const startedAt=fs.statSync(path.join(root,stem+'.pid')).mtimeMs;
  return {host:publicHost,port,sessionId:sessions.get(mode).id,startedAt,players:occupancy(stem,startedAt)};
}
function createAllocator(account, readiness = ready, allocateHunt = startHunt, worker=workerUrl) {
  // ponytail: two warm anchors per mode; the existing backend queues when both are full.
  const shared=new Map();
  for(const mode of ['CITY','SHARED']){
    const state={list:[],byId:new Map(),lastSeen:new Map()};
    state.pool=new CityPool(()=>state.list,async()=>{throw new CapacityUnavailable('hunts');},id=>state.byId.get(id),Date.now,()=>[mode==='CITY'?20:12,mode==='CITY'?20:12]);
    shared.set(mode,state);
  }
  async function allocateShared(mode,size){
    const local=await readiness(mode), destinations=local?[local]:[];
    if(worker){try{
      const response=await fetch(worker+'/worlds',{signal:AbortSignal.timeout(8000)});
      if(response.ok){const body=await response.json();if(body[mode])destinations.push(body[mode]);}
    }catch{/* Known local capacity remains usable while the peer is unavailable. */}}
    const state=shared.get(mode);
    const now=Date.now(),fresh=new Set(destinations.map(w=>w.sessionId));
    for(const w of destinations){state.byId.set(w.sessionId,{...w,id:w.sessionId});state.lastSeen.set(w.sessionId,now);}
    for(const [id,seen] of state.lastSeen)if(now-seen>180000){state.lastSeen.delete(id);state.byId.delete(id);}
    // Keep absent worlds' traveller leases until expiry, but give them no new arrivals.
    state.list=[...state.byId.values()].map(w=>({id:w.sessionId,players:fresh.has(w.sessionId)?w.players:undefined,startedAt:fresh.has(w.sessionId)?w.startedAt||0:0}));
    return state.pool.allocate(size);
  }
return http.createServer(async (req, res) => {
  function reply(status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
  try {
    if(req.method==='GET'&&req.url==='/worlds'){reply(200,{CITY:await readiness('CITY'),SHARED:await readiness('SHARED')});return;}
    if (req.method === 'GET' && req.url === '/gameservers') {
      const available = await Promise.all(Object.keys(worlds).map(readiness));
      const servers=available.filter(Boolean).map(world=>({id:world.sessionId,retiring:false}));let complete=true;
      if(worker){try{const response=await fetch(worker+'/gameservers',{signal:AbortSignal.timeout(5000)});if(!response.ok)throw Error('Worker unavailable');const remote=await response.json();if(!Array.isArray(remote.servers))throw Error('Invalid worker');servers.push(...remote.servers);complete=remote.complete===true;}catch{complete=false;}}
      reply(200, { complete, servers }); return;
    }
    if (req.method !== 'POST' || req.url !== '/api/matchmaker/handle-matchmaking-for-player') { reply(404, {}); return; }
    let text = '';
    for await (const chunk of req) { text += chunk; if (text.length > 8192) { reply(413, {}); return; } }
    const body = JSON.parse(text);
    const permitted = typeof account === 'function' ? account : id => id === account;
    if (!Array.isArray(body.ExpectedPlayers) || !body.ExpectedPlayers.length || body.ExpectedPlayers.length > 4 ||
        new Set(body.ExpectedPlayers).size !== body.ExpectedPlayers.length || !body.ExpectedPlayers.every(permitted)) { reply(403, {}); return; }
    const tutorial = body.GameMode === 'ISLAND' && !body.HuntId && body.ExpectedPlayers.length === 1 && body.GameArgs === catalog.Tutorial.url;
    const mode = tutorial ? 'Tutorial' : body.GameMode === 'CITY' ? 'CITY' : body.GameMode === 'SHARED' && body.HuntId === 'ShatteredIsles_TrainingDojo' ? 'SHARED' :
      ['ISLAND','SHARED'].includes(body.GameMode) && body.HuntId !== 'Tutorial' && Object.hasOwn(catalog,body.HuntId) ? body.HuntId : null;
    if (!mode) {
      reply(422, { error: 'world_not_ported' }); return;
    }
    // Route deterministically: retries after accepted-but-starting or a timeout must never start another world.
    if(worker&&Object.hasOwn(catalog,mode)&&workerOwns(mode,body.ExpectedPlayers)){
      try{
        const response=await fetch(worker+'/api/matchmaker/handle-matchmaking-for-player',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
        reply(response.status,await response.json());
      }catch{reply(503,{error:'capacity_unavailable',reason:'hunts'});}return;
    }
    const destination = Object.hasOwn(catalog,mode) ? await allocateHunt(mode,body.ExpectedPlayers) : await allocateShared(mode,body.ExpectedPlayers.length);
    if (!destination) { reply(503, { error: 'capacity_unavailable',reason:'ports' }); return; }
    console.log(`Local quest test: ${body.GameMode} ${body.HuntId || ''} -> ${destination.host}:${destination.port}`);
    reply(200, destination);
  } catch(error) { if(error instanceof CapacityUnavailable)reply(503,{error:'capacity_unavailable',reason:error.reason});else reply(400,{error:'invalid_local_request'}); }
});
}
module.exports = { createAllocator, emptyHunt, huntKey, workerOwns };
if (require.main === module) {
  let account = require('./lab-account.cjs').userId;
  if(process.env.DR_1105_WORKER==='1')account=id=>typeof id==='string'&&/^UID-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
  else if (process.env.LOCAL_1105_REALM === '1') {
    const Database = require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
    const db = new Database(path.join(root,'backend-state/realm.db'),{readonly:true,fileMustExist:true});
    account = id => typeof id === 'string' && !!db.prepare('SELECT 1 FROM users WHERE userId=? AND isAdmin=0').get(id);
  }
  createAllocator(account).listen(62001, '127.0.0.1', () => console.log('Local test allocator 127.0.0.1:62001'));
  setInterval(()=>cleanEmptyHunts().catch(error=>console.error('Local island cleanup:',error.message)),30000).unref();
}
