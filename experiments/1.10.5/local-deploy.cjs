// Isolated test worlds. Only the explicitly ported hunt routes are admitted.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
// Windows PowerShell must load its own modules, not the parent PowerShell 7 modules.
const powershell = path.join(process.env.SystemRoot || 'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
const psEnvironment = { ...process.env, PSModulePath: path.join(path.dirname(powershell),'Modules') };
const root = path.resolve(__dirname, '../../..');
const host = process.env.DR_1105_BIND_IP || '127.0.0.1';
if (!require('./realm-proxy.cjs').privateIp(host) && !['127.0.0.1','0.0.0.0'].includes(host)) throw Error('Invalid bind address');
const publicHost=process.env.DR_1105_PUBLIC_HOST||host;
if(require('node:net').isIP(publicHost)!==4||publicHost==='0.0.0.0')throw Error('Set the advertised IPv4 address');
const huntPorts=[63872,63873,63874,63875].slice(0,process.env.DR_1105_MAX_HUNTS==='2'?2:4);
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
const huntKey = (hunt, players) => hunt === 'Tutorial' ? `${hunt}_${players[0]}` : hunt;
if (require.main === module && fs.existsSync(huntFile)) {
  for (const entry of JSON.parse(fs.readFileSync(huntFile))) {
    if (catalog[entry.hunt] && Number.isInteger(entry.port) && entry.port >= 63872 && entry.port <= 63875) {
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
    const port = huntPorts.find(p => ![...hunts.values()].some(x=>x.port===p));
    if (!port) return;
    hunts.set(hunt,{hunt:definition,players,port,requestedAt:Date.now()});
    worlds[hunt] = {stem:`native-hunt-${port}`,port}; saveHunts(); launching.add(hunt);
    execFile(powershell,['-NoProfile','-NonInteractive','-File',path.join(__dirname,'start-server.ps1'),
      '-World','combat-probe','-BindIp',host,'-Hunt',definition,'-HuntPort',String(port),'-Players',players.join(',')],
      {windowsHide:true,timeout:60000,env:psEnvironment},(error,stdout,stderr)=>{
        launching.delete(hunt);
        if(error){console.error(`Hunt startup failed: ${hunt}: ${String(stderr || error.message).slice(0,3000)}`);hunts.delete(hunt);delete worlds[hunt];saveHunts();}
      });
  }
  const entry=hunts.get(hunt); if(entry) {entry.requestedAt=Date.now();saveHunts();}
  return ready(hunt);
}
const sessions = new Map();
async function ready(mode) {
  if (!worlds[mode] || retiring.has(mode)) return;
  const { stem, port } = worlds[mode];
  let pid;
  try { pid = Number(fs.readFileSync(path.join(root, stem + '.pid'), 'utf8')); } catch { return; }
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  const listening = await new Promise(resolve => execFile(powershell, ['-NoProfile', '-NonInteractive', '-Command',
    `@(Get-NetUDPEndpoint -LocalAddress ${host} -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq ${pid}).Count`],
    { windowsHide: true, timeout: 5000, env:psEnvironment }, (error, stdout) => resolve(!error && stdout.trim() === '1')));
  if (!listening) return;
  if (sessions.get(mode)?.pid !== pid) sessions.set(mode, { pid, id: crypto.randomUUID() });
  return { host:publicHost, port, sessionId: sessions.get(mode).id };
}
function createAllocator(account, readiness = ready, allocateHunt = startHunt) {
return http.createServer(async (req, res) => {
  function reply(status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
  try {
    if (req.method === 'GET' && req.url === '/gameservers') {
      const available = await Promise.all(Object.keys(worlds).map(readiness));
      reply(200, { complete: true, servers: available.filter(Boolean).map(world => ({ id: world.sessionId, retiring: false })) }); return;
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
    const destination = Object.hasOwn(catalog,mode) ? await allocateHunt(mode,body.ExpectedPlayers) : await readiness(mode);
    if (!destination) { reply(503, { error: 'capacity_unavailable',reason:'ports' }); return; }
    console.log(`Local quest test: ${body.GameMode} ${body.HuntId || ''} -> ${destination.host}:${destination.port}`);
    reply(200, destination);
  } catch { reply(400, { error: 'invalid_local_request' }); }
});
}
module.exports = { createAllocator, emptyHunt, huntKey };
if (require.main === module) {
  let account = require('./lab-account.cjs').userId;
  if (process.env.LOCAL_1105_REALM === '1') {
    const Database = require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
    const db = new Database(path.join(root,'backend-state/realm.db'),{readonly:true,fileMustExist:true});
    account = id => typeof id === 'string' && !!db.prepare('SELECT 1 FROM users WHERE userId=? AND isAdmin=0').get(id);
  }
  createAllocator(account).listen(62001, '127.0.0.1', () => console.log('Local test allocator 127.0.0.1:62001'));
  setInterval(()=>cleanEmptyHunts().catch(error=>console.error('Local island cleanup:',error.message)),30000).unref();
}
