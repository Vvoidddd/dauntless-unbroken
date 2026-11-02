import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startDashboard} from './dashboard.mjs';
import {startWorkerHealth} from './worker-health.mjs';
import {fleetSummary} from './dashboard-fleet.mjs';
test('fleet mirror authenticates, uses canonical rows and fails closed',async()=>{
 const key='owner-key-for-mirror-test',fleetKey='separate-canonical-owner-key';let fail=false,calls=0;
 const server=await startDashboard({key,fleetKey,port:0,backend:'http://127.0.0.1:62000',fleetUrl:'http://127.0.0.1:62111',fetcher:async(url,opts)=>{
  if(url.port==='62111'){calls++;assert.equal(opts.headers['x-dashboard-key'],fleetKey);if(fail)throw Error('offline');return Response.json({fleet:{rows:[{id:1},{id:2},{id:5}]},error:null});}
  return Response.json({Users:[],players:[],instances:[],playersOnline:0});
 }});
 try{const base=`http://127.0.0.1:${server.address().port}/api/status`;
 assert.equal((await fetch(base)).status,401);assert.equal(calls,0);
 assert.equal((await(await fetch(base,{headers:{'x-dashboard-key':key}})).json()).fleet.rows.length,3);
 fail=true;assert.equal((await fetch(base,{headers:{'x-dashboard-key':key}})).status,503);
 }finally{await new Promise(r=>server.close(r));}
 await assert.rejects(startDashboard({key,backend:'http://127.0.0.1:62000',fleetUrl:'https://example.org'}));
 const now=new Date().toISOString();const node={configured:true,online:true,sample:{at:now,role:'key-bot-storage'}};
 const rows=fleetSummary({at:now},node,null,Date.now(),null,null,node).rows;
 assert.deepEqual(rows.map(r=>r.id),[1,2,5]);assert.match(rows[2].name,/^Server #3/);
});
test('worker probes active allocator and backend ports',async()=>{
 const seen=[];const server=await startWorkerHealth({port:0,deployPort:62001,backendPort:62000,collect:async()=>({at:new Date().toISOString(),processes:[],receivedBytes:0,sentBytes:0}),fetcher:async(url)=>{seen.push(url);return Response.json({servers:[],capacity:{running:7,pending:0,limit:42}});}});
 try{assert.ok(seen.includes('http://127.0.0.1:62001/gameservers'));assert.ok(seen.includes('http://127.0.0.1:62000/dauntless-status'));const s=await(await fetch(`http://127.0.0.1:${server.address().port}/health`)).json();assert.equal(s.capacity.running,7);}
 finally{await new Promise(r=>server.close(r));}
});
