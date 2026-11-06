// Run after npm test: npx electron scripts/check-cdn-session.cjs
// Uses the public 59-byte version file; never touches a player's installation.
const {app,net,session}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const https=require('node:https'),{EventEmitter}=require('node:events');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'unbroken-cdn-check-'));
app.setPath('userData',path.join(dir,'profile'));
const timer=setTimeout(()=>{console.error('CDN check timed out');app.exit(2);},45000);
app.whenReady().then(async()=>{
  // Match production's renderer deny policy. The old fallback used this session.
  session.defaultSession.webRequest.onBeforeRequest((_details,cb)=>cb({cancel:true}));
  const base='https://downloads.voidvault.xyz/1.10.5/';
  await new Promise((resolve,reject)=>{
    const req=net.request(base+'Version.txt');
    req.on('response',()=>reject(Error('Renderer network restriction was bypassed')));
    req.on('error',e=>{try{assert.match(e.message,/ERR_BLOCKED_BY_CLIENT/);resolve();}catch(e){reject(e);}});
    req.end();
  });
  const {DownloadJob}=require('../.test-build/src/main/downloader.js');
  let failures=0;
  const original=https.request;
  https.request=()=>{
    failures++;
    const req=new EventEmitter();req.destroy=()=>req;
    req.end=()=>{queueMicrotask(()=>req.emit('error',Object.assign(Error('forced TLS failure'),{code:'EPROTO'})));return req;};
    return req;
  };
  const file={path:'Version.txt',size:59,sha256:'2ff2d9e083fca8353fd7bcda5bfe5fc24498d1a5eb7385a8f71886121a91c851'};
  fs.writeFileSync(path.join(dir,'Version.txt.part'),'dauntles');
  try{
    await new DownloadJob({endpoint:{host:'127.0.0.1',port:0,pin:null},key:'',
      downloadBaseUrl:base,installDir:dir,files:[file],maxAttempts:2,backoffMs:()=>1}).run();
    assert.equal(failures,1);
    assert.equal(fs.statSync(path.join(dir,'Version.txt')).size,59);
    assert.equal(fs.existsSync(path.join(dir,'Version.txt.part')),false);
    console.log('PASS: renderer blocked; HTTPS fallback resumed and verified the CDN file.');
  }finally{https.request=original;}
  clearTimeout(timer);app.exit(0);
}).catch(e=>{console.error(e);clearTimeout(timer);app.exit(1);});
