const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const os = require('node:os');
const {mock} = require('node:test');
process.env.GAMESERVER_MEMORY_GUARD = '0';
const original = {read: fs.readFileSync, stat: fs.statSync, open: fs.openSync, readFd: fs.readSync, close: fs.closeSync, write: fs.writeFileSync};
const started = Date.now();
let launches = 0;
mock.method(cp, 'execFile', (exe, args, options, callback) => {
  if (args.includes('-File')) { launches++; callback(null, '', ''); return; }
  const sockets = Date.now() - started >= 300 ? [{LocalPort: 63872, OwningProcess: 123}] : [];
  callback(null, JSON.stringify(sockets), '');
});
mock.method(fs, 'writeFileSync', (file, ...args) => String(file).endsWith('realm-hunts.json') ? undefined : original.write.call(fs, file, ...args));
mock.method(fs, 'readFileSync', (file, ...args) => String(file).endsWith('native-hunt-63872.pid') ? '123' : original.read.call(fs, file, ...args));
mock.method(fs, 'statSync', (file, ...args) => {
  if (String(file).endsWith('native-hunt-63872.pid')) return {mtimeMs: started};
  if (String(file).endsWith('native-hunt-63872.log')) return {mtimeMs: Date.now(), size: 64};
  return original.stat.call(fs, file, ...args);
});
mock.method(fs, 'openSync', (file, ...args) => String(file).endsWith('native-hunt-63872.log') ? 999999 : original.open.call(fs, file, ...args));
mock.method(fs, 'readSync', (fd, buffer, ...args) => fd === 999999 ? buffer.write('engine_tick graph=0000000000001234 clients=0\n') : original.readFd.call(fs, fd, buffer, ...args));
mock.method(fs, 'closeSync', fd => fd === 999999 ? undefined : original.close.call(fs, fd));
const {createAllocator} = require('./local-deploy.cjs');

(async () => {
  const server = createAllocator('local-test');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/matchmaker/handle-matchmaking-for-player`;
    const body = JSON.stringify({GameMode:'ISLAND', HuntId:'ShatteredIsles_IslandB', ExpectedPlayers:['local-test']});
    const responses = await Promise.all([0, 1].map(() => fetch(url, {method:'POST', headers:{'content-type':'application/json'}, body})));
    const worlds = await Promise.all(responses.map(response => response.json()));
    assert.deepEqual(responses.map(response => response.status), [200, 200], JSON.stringify(worlds));
    assert.equal(worlds[0].sessionId, worlds[1].sessionId);
    assert.equal(launches, 1, 'concurrent requests do not launch duplicate hunts');
    assert.ok(Date.now() - started < 6000, 'the original requests complete as soon as readiness is observed');
    delete process.env.GAMESERVER_MEMORY_GUARD;
    mock.method(os, 'freemem', () => 0);
    const capacityStart = Date.now();
    const rejected = await fetch(url, {method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({GameMode:'ISLAND', HuntId:'ShatteredIsles_IslandC', ExpectedPlayers:['local-test']})});
    assert.equal(rejected.status, 503);
    assert.equal((await rejected.json()).reason, 'memory');
    assert.equal(launches, 1, 'capacity rejection does not launch a hunt');
    assert.ok(Date.now() - capacityStart < 1000, 'capacity rejection is not delayed by the readiness wait');
    console.log('Hunt allocation waits for readiness without starting duplicates');
  } finally { await new Promise(resolve => server.close(resolve)); mock.restoreAll(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
