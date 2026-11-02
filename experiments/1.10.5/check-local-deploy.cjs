const assert = require('node:assert/strict');
const { createAllocator, emptyHunt, huntKey } = require('./local-deploy.cjs');
async function check() {
  assert.notEqual(huntKey('Tutorial',['one']),huntKey('Tutorial',['two']));
  assert.equal(huntKey('ShatteredIsles_IslandB',['one']),huntKey('ShatteredIsles_IslandB',['two']));
  assert.equal(emptyHunt({requestedAt:0},'engine_tick clients=0 frame=2',99999,100000),true);
  assert.equal(emptyHunt({requestedAt:99999},'engine_tick clients=0',99999,100000),false);
  assert.equal(emptyHunt({requestedAt:0},'engine_tick clients=1',99999,100000),false);
  assert.equal(emptyHunt({requestedAt:0},'engine_tick clients=0',0,100000),false);
  assert.equal(emptyHunt({requestedAt:0},'no sample',99999,100000),false);
  let dojoReady = true;
  const server = createAllocator('local-test', async mode => mode === 'SHARED' && !dojoReady ? undefined : {
    host: '127.0.0.1', port: mode === 'CITY' ? 63870 : 63871, sessionId: mode,
  }, async (hunt, players) => {
    assert.ok(['ShatteredIsles_IslandB','Tutorial'].includes(hunt));assert.deepEqual(players,['local-test']);
    return {host:'127.0.0.1',port:63872,sessionId:hunt};
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const allocate = body => fetch(base + '/api/matchmaker/handle-matchmaking-for-player', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ExpectedPlayers: ['local-test'], ...body }),
  });
  try {
    for (const [GameMode, HuntId, port] of [['CITY', '', 63870], ['SHARED', 'ShatteredIsles_TrainingDojo', 63871]]) {
      const reply = await allocate({ GameMode, HuntId });
      assert.equal(reply.status, 200);
      assert.equal((await reply.json()).port, port);
    }
    const health = await (await fetch(base + '/gameservers')).json();
    assert.deepEqual(health.servers.map(world => world.id), ['CITY', 'SHARED']);
    assert.equal((await allocate({ GameMode: 'ISLAND' })).status, 422);
    const GameArgs=require('./hunting-grounds.json').Tutorial.url;
    const tutorial=await allocate({GameMode:'ISLAND',GameArgs});
    assert.equal(tutorial.status,200);assert.equal((await tutorial.json()).sessionId,'Tutorial');
    assert.equal((await allocate({GameMode:'ISLAND',GameArgs:GameArgs+'?bad=1'})).status,422);
    assert.equal((await allocate({GameMode:'ISLAND',HuntId:'Tutorial'})).status,422);
    const hunt=await allocate({GameMode:'ISLAND',HuntId:'ShatteredIsles_IslandB'});
    assert.equal(hunt.status,200);assert.equal((await hunt.json()).port,63872);
    assert.equal((await allocate({GameMode:'ISLAND',HuntId:'constructor'})).status,422);
    assert.equal((await allocate({GameMode:'CITY',ExpectedPlayers:['local-test','local-test']})).status,403);
    assert.equal((await allocate({ GameMode: 'SHARED', HuntId: 'Other' })).status, 422);
    assert.equal((await allocate({ GameMode: 'CITY', ExpectedPlayers: ['another-account'] })).status, 403);
    dojoReady = false;
    assert.equal((await allocate({ GameMode: 'SHARED', HuntId: 'ShatteredIsles_TrainingDojo' })).status, 503);
    assert.deepEqual((await (await fetch(base + '/gameservers')).json()).servers.map(world => world.id), ['CITY']);
    console.log('Local allocation: distinct worlds, unavailable/unsupported destinations and foreign accounts checked.');
  } finally { await new Promise(resolve => server.close(resolve)); }
}
check().catch(error => { console.error(error); process.exitCode = 1; });
