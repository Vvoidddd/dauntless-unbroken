const assert=require('node:assert/strict'),http=require('node:http'),reply=require('./retired-worker.cjs');
(async()=>{const server=http.createServer(reply);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{const base='http://127.0.0.1:'+server.address().port;
  const status=await fetch(base+'/gameservers');assert.equal(status.status,200);assert.deepEqual((await status.json()).servers,[]);
  const launch=await fetch(base+'/api/matchmaker/handle-matchmaking-for-player',{method:'POST'});assert.equal(launch.status,503);assert.equal((await launch.json()).error,'capacity_unavailable');
  console.log('Retired worker reports no worlds and rejects launches for local fallback.');
 }finally{server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
