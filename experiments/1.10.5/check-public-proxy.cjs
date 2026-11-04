const assert=require('node:assert/strict'),http=require('node:http');
const {createProxy,needsUpdate,headers}=require('./realm-proxy.cjs');
async function main(){
 const fake={headers:{'x-forwarded-for':'203.0.113.7','x-dauntless-gateway':'spoof','x-dauntless-unbroken-gameserver-apikey':'secret'},socket:{remoteAddress:'127.0.0.1'}};
 assert.equal(headers(fake,'real')['x-forwarded-for'],'127.0.0.1');
 assert.equal(headers(fake,'real',true)['x-forwarded-for'],'203.0.113.7');
 assert.equal(headers(fake,'real',true)['x-dauntless-unbroken-gameserver-apikey'],undefined);
 assert.equal(headers(fake,'real',true)['x-dauntless-gateway'],'real');
 const upstream=http.createServer((req,res)=>res.end('allowed'));
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const proxy=createProxy(upstream.address().port,null,null,{loopback:true,policy:()=>({gameVersion:'1.10.5',minimumLauncherVersion:'1.0.45'})});
 await new Promise(r=>proxy.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${proxy.address().port}`;
 try{
  for(const route of ['/unbroken/api/GetUserInfo','/unbroken/api/Register','/unbroken/api/Admission','/Unbroken/API/getuserinfo/?x=1']){
   assert.equal((await fetch(base+route)).status,426);
   assert.equal((await fetch(base+route,{headers:{'x-unbroken-launcher-version':'1.0.45'}})).status,200);
  }
  assert.equal((await (await fetch(base+'/unbroken/api/LauncherPolicy')).json()).minimumLauncherVersion,'1.0.45');
  process.env.MAINTENANCE_MODE='1';
  assert.equal((await fetch(base+'/unbroken/api/Register',{method:'POST',headers:{'x-unbroken-launcher-version':'1.0.45'}})).status,503);
  delete process.env.MAINTENANCE_MODE;
  assert.equal(needsUpdate('1.0.45-test.1','1.0.45'),true);assert.equal(needsUpdate('1.0.46','1.0.45'),false);
  console.log('Public minimum version and canonical route checks passed.');
 }finally{await Promise.all([new Promise(r=>proxy.close(r)),new Promise(r=>upstream.close(r))]);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
