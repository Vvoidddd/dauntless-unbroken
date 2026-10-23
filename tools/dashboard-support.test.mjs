import {test} from 'node:test';import assert from 'node:assert/strict';
import {startDashboard} from './dashboard.mjs';
test('support inbox is owner-only, proxies fixed backend paths, and requires same-origin review',async()=>{
 const key='test-support-owner-key',id='12345678-1234-4123-8123-123456789abc',calls=[];
 const server=await startDashboard({key,port:0,backend:'http://127.0.0.1:61000',fetcher:async(url,options)=>{
  calls.push({path:url.pathname,method:options?.method,headers:options?.headers});
  if(url.pathname.includes('SupportReports'))return Response.json({reports:[],unread:2,retentionDays:14});
  return Response.json({Users:[],players:[],instances:[],playersOnline:0});
 }});
 try{
  const base=`http://127.0.0.1:${server.address().port}`,headers={'x-dashboard-key':key};
  assert.equal((await fetch(base+'/api/support-reports')).status,401);
  assert.equal((await fetch(base+'/dashboard-support.js')).status,200);
  assert.equal((await fetch(base+'/api/support-reports?q=Test',{headers})).status,200);
  assert.equal(calls.at(-1).path,'/unbroken/api/SupportReports');
  assert.equal((await fetch(base+'/api/support-reports/'+id,{headers})).status,200);
  assert.equal((await fetch(base+'/api/support-reports/'+id+'/review',{method:'POST',headers})).status,403);
  assert.equal((await fetch(base+'/api/support-reports/'+id+'/review',{method:'POST',headers:{...headers,origin:base}})).status,200);
  assert.equal(calls.at(-1).method,'POST');assert.equal(calls.at(-1).headers['x-dauntless-unbroken-user-api-key'],key);
  assert.equal((await fetch(base+'/api/support-reports/'+id+'/review',{headers})).status,405);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
