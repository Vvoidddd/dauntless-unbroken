import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import {fetchHuntRegions,saveHuntRegion} from '../src/main/hostapi';

test('disabled saved regions fall back to EU without hiding authentication or server errors',async()=>{
  const posted:string[]=[];let failure=503,code='region_unavailable';
  const server=http.createServer((req,res)=>{let data='';req.on('data',chunk=>data+=chunk);req.on('end',()=>{
    const {region}=JSON.parse(data);posted.push(region);res.setHeader('Content-Type','application/json');
    res.statusCode=region==='main'?200:failure;res.end(JSON.stringify(region==='main'?{region}:{error:code}));
  });});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const ep={host:'127.0.0.1',port:(server.address() as AddressInfo).port,pin:null};
    assert.equal(await saveHuntRegion(ep,'UUK_'+'a'.repeat(48),'us'),'main');assert.deepEqual(posted.splice(0),['us','main']);
    assert.equal(await saveHuntRegion(ep,'UUK_'+'a'.repeat(48),'ger'),'main');assert.deepEqual(posted.splice(0),['ger','main']);
    failure=401;assert.equal(await saveHuntRegion(ep,'UUK_'+'a'.repeat(48),'us'),null);assert.deepEqual(posted.splice(0),['us']);
    failure=503;code='maintenance';assert.equal(await saveHuntRegion(ep,'UUK_'+'a'.repeat(48),'us'),null);assert.deepEqual(posted.splice(0),['us']);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('region settings only advertise regions enabled by this server',async()=>{
  let body:unknown={region:'main',enabled:false,probes:[{region:'us'}]};
  const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const ep={host:'127.0.0.1',port:(server.address() as AddressInfo).port,pin:null};
    assert.deepEqual(await fetchHuntRegions(ep,'UUK_'+'a'.repeat(48)),['main']);
    body={region:'us',enabled:true,probes:[{region:'ger'},{region:'ger'},{region:'unknown'}]};
    assert.deepEqual(await fetchHuntRegions(ep,'UUK_'+'a'.repeat(48)),['main','ger','us']);
    body={enabled:true,probes:[]};assert.deepEqual(await fetchHuntRegions(ep,'UUK_'+'a'.repeat(48)),['main','ger','us']);
    body={};assert.deepEqual(await fetchHuntRegions(ep,'UUK_'+'a'.repeat(48)),['main']);
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
