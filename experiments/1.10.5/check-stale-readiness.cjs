const assert=require('node:assert/strict');
const fs=require('node:fs');
const {mock}=require('node:test');
const cp=require('node:child_process');
const originalRead=fs.readFileSync, originalStat=fs.statSync;
let modified=Date.now()-60000;
let heartbeat='engine_tick driver=0000000000001234 graph=0000000000001234 clients=1\n';
mock.method(cp,'execFile',(...args)=>args.at(-1)(null,JSON.stringify([{LocalPort:63870,OwningProcess:123}])));
mock.method(fs,'readFileSync',function(file,...args){return String(file).endsWith('native-server.pid')?'123':originalRead.call(this,file,...args);});
mock.method(fs,'statSync',function(file,...args){
  if(String(file).endsWith('native-server.pid'))return {mtimeMs:Date.now()-120000};
  if(String(file).endsWith('native-server.log'))return {mtimeMs:modified,size:Buffer.byteLength(heartbeat)};
  return originalStat.call(this,file,...args);
});
const originalOpen=fs.openSync,originalClose=fs.closeSync,originalReadFd=fs.readSync;
mock.method(fs,'openSync',function(file,...args){return String(file).endsWith('native-server.log')?999999:originalOpen.call(this,file,...args);});
mock.method(fs,'readSync',function(fd,buffer,...args){if(fd===999999)return buffer.write(heartbeat);return originalReadFd.call(this,fd,buffer,...args);});
mock.method(fs,'closeSync',function(fd){if(fd!==999999)return originalClose.call(this,fd);});
const {probeReady}=require('./local-deploy.cjs');
(async()=>{
  try{
    assert.equal(await probeReady('CITY'),undefined,'bound UDP and live PID cannot mask a stale game thread');
    modified=Date.now();
    heartbeat='engine_tick driver=0000000000001234 graph=0000000000000000 clients=1\n';
    assert.equal(await probeReady('CITY'),undefined,'a missing replication graph is not ready');
    heartbeat='engine_tick clients=1\n';
    assert.equal(await probeReady('CITY'),undefined,'a heartbeat without graph information is not ready');
    heartbeat='engine_tick graph=0000000000001234 clients=1\nengine_tick graph=0000000000000000 clients=1\n';
    assert.equal(await probeReady('CITY'),undefined,'the latest heartbeat controls readiness');
    heartbeat='engine_tick driver=0000000000001234 graph=0000000000001234 clients=1\n';
    assert.equal((await probeReady('CITY')).players,1,'fresh heartbeat with networking restores readiness');
    console.log('Stale readiness checks passed');
  }finally{mock.restoreAll();}
})().catch(error=>{console.error(error);process.exitCode=1;});
