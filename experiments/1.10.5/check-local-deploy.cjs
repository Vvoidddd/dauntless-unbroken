const assert = require('node:assert/strict');
const { createAllocator } = require('./local-deploy.cjs');
async function check() {
  let dojoReady = true;
  const server = createAllocator('local-test', async mode => mode === 'SHARED' && !dojoReady ? undefined : {
    host: '127.0.0.1', port: mode === 'CITY' ? 62770 : 62771, sessionId: mode,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const allocate = body => fetch(base + '/api/matchmaker/handle-matchmaking-for-player', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ExpectedPlayers: ['local-test'], ...body }),
  });
  try {
    for (const [GameMode, HuntId, port] of [['CITY', '', 62770], ['SHARED', 'ShatteredIsles_TrainingDojo', 62771]]) {
      const reply = await allocate({ GameMode, HuntId });
      assert.equal(reply.status, 200);
      assert.equal((await reply.json()).port, port);
    }
    const health = await (await fetch(base + '/gameservers')).json();
    assert.deepEqual(health.servers.map(world => world.id), ['CITY', 'SHARED']);
    assert.equal((await allocate({ GameMode: 'ISLAND' })).status, 422);
    assert.equal((await allocate({ GameMode: 'SHARED', HuntId: 'Other' })).status, 422);
    assert.equal((await allocate({ GameMode: 'CITY', ExpectedPlayers: ['another-account'] })).status, 403);
    dojoReady = false;
    assert.equal((await allocate({ GameMode: 'SHARED', HuntId: 'ShatteredIsles_TrainingDojo' })).status, 503);
    assert.deepEqual((await (await fetch(base + '/gameservers')).json()).servers.map(world => world.id), ['CITY']);
    console.log('Local allocation: distinct worlds, unavailable/unsupported destinations and foreign accounts checked.');
  } finally { await new Promise(resolve => server.close(resolve)); }
}
check().catch(error => { console.error(error); process.exitCode = 1; });
