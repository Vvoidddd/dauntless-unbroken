const assert=require('node:assert/strict');
const {createAllocator}=require('./local-deploy.cjs');
async function check(){
  const originalNow=Date.now;let now=originalNow();Date.now=()=>now;
  const local={},remote={},actions=[];let serial=0;
  const control=(worlds,host)=>async(mode,action,id)=>{
    actions.push({host,mode,action});
    if(action==='start'){
      if(worlds[mode])return false;
      worlds[mode]={host,port:mode==='CITY'?63870:63871,sessionId:`${host}-${++serial}`,players:0,startedAt:now};return true;
    }
    assert.equal(worlds[mode]?.sessionId,id);assert.equal(worlds[mode].players,0);
    delete worlds[mode];return true;
  };
  const worker=createAllocator(()=>true,async mode=>remote[mode],undefined,undefined,control(remote,'127.0.0.2'));
  await new Promise(r=>worker.listen(0,'127.0.0.1',r));
  const peer=`http://127.0.0.1:${worker.address().port}`;
  const primary=createAllocator(()=>true,async mode=>local[mode],undefined,peer,control(local,'127.0.0.1'));
  await new Promise(r=>primary.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${primary.address().port}`;
  const allocate=mode=>fetch(base+'/api/matchmaker/handle-matchmaking-for-player',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({GameMode:mode,HuntId:mode==='SHARED'?'ShatteredIsles_TrainingDojo':'',ExpectedPlayers:['test']})});
  try{
    for(const [mode,capacity]of [['CITY',20],['SHARED',12]]){
      assert.equal((await allocate(mode)).status,503,'cold start queues the first arrival');
      for(let n=0;n<capacity;n++)assert.equal((await allocate(mode)).status,200);
      assert.equal(remote[mode],undefined,'fill the first world before opening another');
      assert.equal((await allocate(mode)).status,503,'overflow starts the peer world');
      assert.equal((await allocate(mode)).status,200);
      await primary.reapShared();now+=190001;
      // First sample after leases expire begins the empty interval; it cannot stop immediately.
      await primary.reapShared();assert.ok(local[mode]&&remote[mode]);
      local[mode].players=capacity;
      now+=190001;await primary.reapShared();
      assert.ok(local[mode]);assert.equal(remote[mode],undefined,'retire the empty peer, keep occupied local world');
      local[mode].players=0;await primary.reapShared();now+=190001;await primary.reapShared();
      assert.equal(local[mode],undefined,'retire the final world only after empty grace');
      assert.equal((await allocate(mode)).status,503,'a later arrival restarts the world');
      assert.equal((await allocate(mode)).status,200);
      local[mode].players=1;
    }
    assert.equal((await fetch(base+'/shared-world',{method:'POST',body:'{}'})).status,403);
    assert.equal((await fetch(peer+'/shared-world',{method:'POST',body:JSON.stringify({mode:'ISLAND',action:'stop'})})).status,400);
    console.log('PASS: Ramsgate and dojo cold start, fill, overflow, lease protection, peer retirement and restart.');
  }finally{Date.now=originalNow;await Promise.all([new Promise(r=>primary.close(r)),new Promise(r=>worker.close(r))]);}
}
check().catch(e=>{console.error(e);process.exitCode=1;});
