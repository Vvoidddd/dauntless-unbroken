// Two loopback worlds for the local quest test; combat hunts are not ported yet.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const worlds = {
  CITY: { stem: 'native-server', port: 62770 },
  SHARED: { stem: 'native-dojo', port: 62771 },
};
const sessions = new Map();
async function ready(mode) {
  const { stem, port } = worlds[mode];
  let pid;
  try { pid = Number(fs.readFileSync(path.join(root, stem + '.pid'), 'utf8')); } catch { return; }
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  const listening = await new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `@(Get-NetUDPEndpoint -LocalAddress 127.0.0.1 -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq ${pid}).Count`],
    { windowsHide: true, timeout: 5000 }, (error, stdout) => resolve(!error && stdout.trim() === '1')));
  if (!listening) return;
  if (sessions.get(mode)?.pid !== pid) sessions.set(mode, { pid, id: crypto.randomUUID() });
  return { host: '127.0.0.1', port, sessionId: sessions.get(mode).id };
}
function createAllocator(account, readiness = ready) {
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
    if (!Array.isArray(body.ExpectedPlayers) || body.ExpectedPlayers.length !== 1 || body.ExpectedPlayers[0] !== account) { reply(403, {}); return; }
    if (body.GameMode !== 'CITY' && !(body.GameMode === 'SHARED' && body.HuntId === 'ShatteredIsles_TrainingDojo')) {
      reply(422, { error: 'world_not_ported' }); return;
    }
    const destination = await readiness(body.GameMode);
    if (!destination) { reply(503, { error: 'local_server_not_listening' }); return; }
    console.log(`Local quest test: ${body.GameMode} ${body.HuntId || ''} -> 127.0.0.1:${destination.port}`);
    reply(200, destination);
  } catch { reply(400, { error: 'invalid_local_request' }); }
});
}
module.exports = { createAllocator };
if (require.main === module) createAllocator(require('./lab-account.cjs').userId)
  .listen(62001, '127.0.0.1', () => console.log('Local test allocator 127.0.0.1:62001'));
