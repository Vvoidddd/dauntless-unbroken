// Fixed Ramsgate network-test destination; this does not allocate real hunts.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const account = 'UID-6f8b231d-f682-4cbb-b5e2-a9972f641ea4';
const sessionId = crypto.randomUUID();
function ready() {
  const pid = Number(fs.readFileSync(path.join(root, 'native-server.pid'), 'utf8'));
  if (!Number.isSafeInteger(pid) || pid <= 0) return Promise.resolve(false);
  return new Promise(resolve => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `@(Get-NetUDPEndpoint -LocalAddress 127.0.0.1 -LocalPort 62770 -ErrorAction SilentlyContinue | Where-Object OwningProcess -eq ${pid}).Count`],
    { windowsHide: true, timeout: 5000 }, (error, stdout) => resolve(!error && stdout.trim() === '1')));
}
http.createServer(async (req, res) => {
  function reply(status, body) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }
  try {
    if (req.method === 'GET' && req.url === '/gameservers') {
      reply(200, { complete: true, servers: await ready() ? [{ id: sessionId, retiring: false }] : [] }); return;
    }
    if (req.method !== 'POST' || req.url !== '/api/matchmaker/handle-matchmaking-for-player') { reply(404, {}); return; }
    let text = '';
    for await (const chunk of req) { text += chunk; if (text.length > 8192) { reply(413, {}); return; } }
    const body = JSON.parse(text);
    if (!Array.isArray(body.ExpectedPlayers) || body.ExpectedPlayers.length !== 1 || body.ExpectedPlayers[0] !== account) { reply(403, {}); return; }
    if (!await ready()) { reply(503, { error: 'local_server_not_listening' }); return; }
    console.log(`Local network test: ${body.GameMode} request routed to existing Ramsgate 127.0.0.1:62770`);
    reply(200, { host: '127.0.0.1', port: 62770, sessionId });
  } catch { reply(400, { error: 'invalid_local_request' }); }
}).listen(62001, '127.0.0.1', () => console.log('Local test allocator 127.0.0.1:62001'));
