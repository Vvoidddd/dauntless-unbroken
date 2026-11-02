const assert=require('node:assert/strict');
const fs=require('node:fs');
const {mock}=require('node:test');
const cp=require('node:child_process');
const originalRead=fs.readFileSync, originalStat=fs.statSync;
let modified=Date.now()-60000;
mock.method(cp,'execFile',(...args)=>args.at(-1)(null,JSON.stringify([{LocalPort:63870,OwningProcess:123}])));
mock.method(fs,'readFileSync',function(file,...args){return String(file).endsWith('native-server.pid')?'123':originalRead.call(this,file,...args);});
mock.method(fs,'statSync',function(file,...args){
  if(String(file).endsWith('native-server.pid'))return {mtimeMs:Date.now()-120000};
  if(String(file).endsWith('native-server.log'))return {mtimeMs:modified,size:23};
  return originalStat.call(this,file,...args);
});
const originalOpen=fs.openSync,originalClose=fs.closeSync,originalReadFd=fs.readSync;
mock.method(fs,'openSync',function(file,...args){return String(file).endsWith('native-server.log')?999999:originalOpen.call(this,file,...args);});
mock.method(fs,'readSync',function(fd,buffer,...args){if(fd===999999)return buffer.write('engine_tick clients=1\n');return originalReadFd.call(this,fd,buffer,...args);});
mock.method(fs,'closeSync',function(fd){if(fd!==999999)return originalClose.call(this,fd);});
const {probeReady}=require('./local-deploy.cjs');
(async()=>{
  try{
    assert.equal(await probeReady('CITY'),undefined,'bound UDP and live PID cannot mask a stale game thread');
    modified=Date.now();assert.equal((await probeReady('CITY')).players,1,'fresh heartbeat restores readiness');
    console.log('Stale readiness checks passed');
  }finally{mock.restoreAll();}
})().catch(error=>{console.error(error);process.exitCode=1;});
