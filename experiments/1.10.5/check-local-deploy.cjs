const assert = require('node:assert/strict');
const { createAllocator, emptyHunt, deadHunt, staleHunt, huntKey } = require('./local-deploy.cjs');
const catalog=require('./hunting-grounds.json');
async function check() {
  const escalation = Object.entries(catalog).filter(([id])=>id.startsWith('CR19_PlayerHunt_Escalation_'));
  assert.equal(escalation.length,18,'six Escalation families at three difficulties');
  for(const family of ['Randall','Funguy','Mint','Armstrong','Thunderbird','Glitter']){
    for(const [difficulty,min,max] of [['Easy',1,13],['Hard',10,50],['Heroic',51,90]]){
      const route=catalog[`CR19_PlayerHunt_Escalation_${family}_${difficulty}`];
      assert.ok(route,`${family} ${difficulty}`);
      assert.deepEqual([route.initialChallenge,route.maxChallenge,route.rounds,route.maxPlayers],[min,max,5,4]);
      assert.equal(route.gameMode,'/Game/Blueprints/GameMode/BPGM_ArchonEscalation.BPGM_ArchonEscalation_C');
      assert.match(route.map,/^\/Game\/Maps\/islands\/escalation\/escalation_island_/);
      assert.match(route.atmosphere,/^\/Game\/World\/atmospheres\/.*_C$/);
      assert.equal(route.matchmaker,`CR19_MatchmakerHunt_Escalation_${family}_${family==='Glitter'&&difficulty==='Heroic'?'heroic':difficulty}`);
    }
  }
  assert.equal(staleHunt({launchedAt:0,requestedAt:400000},0,400001),true,'polling cannot keep a frozen worker alive');
  assert.equal(staleHunt({launchedAt:300000,requestedAt:300000},0,400001),false,'allow startup grace');
  assert.equal(staleHunt({launchedAt:0,requestedAt:0},399999,400001),false,'keep healthy occupied worlds');
  const dead={port:63872,launchedAt:0,requestedAt:200000};
  assert.equal(deadHunt(dead,false,[],200001),true,'fresh player polls must not preserve a dead startup');
  assert.equal(deadHunt(dead,true,[],200001),false,'a live process keeps its reservation');
  assert.equal(deadHunt(dead,false,null,200001),false,'unknown socket state keeps its reservation');
  assert.equal(deadHunt(dead,false,[{LocalPort:63872}],200001),false,'a listening child keeps its reservation');
  assert.equal(deadHunt(dead,false,[],100000),false,'startup grace protects a launching process');
  assert.notEqual(huntKey('Tutorial',['one']),huntKey('Tutorial',['two']));
  assert.notEqual(huntKey('ShatteredIsles_IslandB',['one']),huntKey('ShatteredIsles_IslandB',['two']));
  assert.equal(huntKey('ShatteredIsles_IslandB',['two','one']),huntKey('ShatteredIsles_IslandB',['one','two']));
  assert.equal(emptyHunt({requestedAt:0},'engine_tick clients=0 frame=2',99999,100000),true);
  assert.equal(emptyHunt({requestedAt:99999},'engine_tick clients=0',99999,100000),false);
  assert.equal(emptyHunt({requestedAt:0},'engine_tick clients=1',99999,100000),false);
  assert.equal(emptyHunt({requestedAt:0},'engine_tick clients=0\nengine_tick clients=1',99999,100000),false);
  assert.equal(emptyHunt({requestedAt:0},'engine_tick clients=0',0,100000),false);
  assert.equal(emptyHunt({requestedAt:0},'no sample',99999,100000),false);
  let dojoReady = true;
  const server = createAllocator('local-test', async mode => mode === 'SHARED' && !dojoReady ? undefined : {
    host: '127.0.0.1', port: mode === 'CITY' ? 63870 : 63871, sessionId: mode,players:0,startedAt:1,
  }, async (hunt, players) => {
    assert.ok(Object.hasOwn(catalog,hunt));assert.deepEqual(players,['local-test']);
    return {host:'127.0.0.1',port:63872,sessionId:hunt};
  }, undefined, async()=>false);
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
    assert.deepEqual(health.servers.map(world=>[world.kind,world.maxPlayers,world.connectedPlayers]),[['city',20,0],['dojo',12,0]]);
    for(const world of health.servers){assert.equal(typeof world.startedAt,'string');assert.equal(typeof world.map,'string');assert.equal(world.behemoth,null);assert.ok(Array.isArray(world.expectedPlayers));}
    assert.equal((await allocate({ GameMode: 'ISLAND' })).status, 422);
    const GameArgs=require('./hunting-grounds.json').Tutorial.url;
    const tutorial=await allocate({GameMode:'ISLAND',GameArgs});
    assert.equal(tutorial.status,200);assert.equal((await tutorial.json()).sessionId,'Tutorial');
    assert.equal((await allocate({GameMode:'ISLAND',GameArgs:GameArgs+'?bad=1'})).status,422);
    assert.equal((await allocate({GameMode:'ISLAND',HuntId:'Tutorial'})).status,422);
    const hunt=await allocate({GameMode:'ISLAND',HuntId:'ShatteredIsles_IslandB'});
    assert.equal(hunt.status,200);assert.equal((await hunt.json()).port,63872);
    for(const HuntId of Object.keys(catalog).filter(id=>id!=='Tutorial')){
      for(const GameMode of ['ISLAND','SHARED']){
        const response=await allocate({GameMode,HuntId});assert.equal(response.status,200,HuntId);
        assert.equal((await response.json()).sessionId,HuntId);
      }
    }
    assert.equal((await allocate({GameMode:'ISLAND',HuntId:'constructor'})).status,422);
    assert.equal((await allocate({GameMode:'CITY',ExpectedPlayers:['local-test','local-test']})).status,403);
    assert.equal((await allocate({ GameMode: 'SHARED', HuntId: 'Other' })).status, 422);
    assert.equal((await allocate({ GameMode: 'CITY', ExpectedPlayers: ['another-account'] })).status, 403);
    dojoReady = false;
    assert.equal((await allocate({ GameMode: 'SHARED', HuntId: 'ShatteredIsles_TrainingDojo' })).status, 503);
    assert.deepEqual((await (await fetch(base + '/gameservers')).json()).servers.map(world => world.id), ['CITY']);
    dojoReady = true;
    const recovered=await Promise.all(Array.from({length:12},()=>allocate({GameMode:'SHARED',HuntId:'ShatteredIsles_TrainingDojo'})));
    assert.equal(recovered.filter(r=>r.status===200).length,11,'temporary telemetry loss preserves the traveller already reserved');
    assert.equal(recovered.filter(r=>r.status===503).length,1);
    const responses=await Promise.all(Array.from({length:20},()=>allocate({GameMode:'CITY'})));
    assert.equal(responses.filter(r=>r.status===200).length,19,'concurrent arrivals reserve the remaining 19 seats');
    assert.equal(responses.filter(r=>r.status===503).length,1,'full Ramsgate queues the next player');
    console.log('Local allocation: distinct worlds, unavailable/unsupported destinations and foreign accounts checked.');
  } finally { await new Promise(resolve => server.close(resolve)); }
}
check().catch(error => { console.error(error); process.exitCode = 1; });
