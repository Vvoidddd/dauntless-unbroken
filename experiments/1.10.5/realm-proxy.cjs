// The front door always marks requests as proxied, preserving backend admin/GS guards.
const http = require('node:http'), https=require('node:https'), net = require('node:net');
const fs=require('node:fs'),path=require('node:path');
const share=path.resolve(__dirname,'../../../share');
async function download(req,res,port){
  const files={'/test/game-package.json':['game-package.json','application/json'],'/test/game.zip':['Unbroken-1.10.5-Game.zip','application/zip'],'/test/launcher.zip':['Unbroken1105Test.zip','application/zip']};
  const file=files[req.url];if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404).end();return;}
  if(req.url!=='/test/launcher.zip'){
    const key=req.headers['x-dauntless-unbroken-user-api-key'];
    if(typeof key!=='string'||key.length>128){res.writeHead(401).end();return;}
    const auth=await fetch(`http://127.0.0.1:${port}/unbroken/api/GetUserInfo`,{headers:{'x-dauntless-unbroken-user-api-key':key},signal:AbortSignal.timeout(5000)});
    await auth.body?.cancel();if(!auth.ok){res.writeHead(401).end();return;}
  }
  const name=path.join(share,file[0]);let stat;
  try{stat=fs.statSync(name);}catch{res.writeHead(503).end('Test package is still being prepared.');return;}
  res.writeHead(200,{'content-type':file[1],'content-length':stat.size,'cache-control':'no-store','x-content-type-options':'nosniff'});
  if(req.method==='HEAD'){res.end();return;}
  const stream=fs.createReadStream(name);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
function privateIp(ip) {
  if (net.isIP(ip)!==4) return false;
  const [a,b]=ip.split('.').map(Number);
  return a===100 && b>=64 && b<=127;
}
function headers(req, secret, trusted=false) {
  const h={...req.headers,host:'127.0.0.1:62000','x-forwarded-for':req.socket.remoteAddress};
  delete h['x-dauntless-unbroken-gameserver-apikey'];
  delete h['x-dauntless-gateway'];
  // Never interpret a forwarded Host or client-supplied proxy header as local privilege.
  delete h.forwarded; delete h['x-real-ip']; delete h['x-forwarded-host'];
  if(trusted && net.isIP(req.headers['x-forwarded-for']))h['x-forwarded-for']=req.headers['x-forwarded-for'];
  if(secret)h['x-dauntless-gateway']=secret;
  return h;
}
function createProxy(port=62000,publicOptions=null,login=null,options={}) {
  const limits=new Map();
  const trusted=req=>options.loopback && options.gatewaySecret && req.headers['x-dauntless-gateway']===options.gatewaySecret;
  const forwarded=req=>headers(req,options.gatewaySecret,!!trusted(req));
  const server=(publicOptions?https.createServer.bind(https,publicOptions):http.createServer)((req,res)=>{
    let route;try{route=new URL(req.url,'http://localhost').pathname.replace(/\/+$/,'').toLowerCase();}catch{res.writeHead(400).end();return;}
    const local=options.loopback && ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!publicOptions&&!local&&!privateIp(req.socket.remoteAddress)) {res.writeHead(403).end();return;}
    if(local&&options.gatewaySecret&&!trusted(req)){res.writeHead(403).end();return;}
    let policy;
    try{policy=options.policy?.()??{gameVersion:'1.10.5',minimumLauncherVersion:null};}
    catch{res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({message:'Launcher policy unavailable. Please retry.'}));return;}
    if(route==='/unbroken/api/launcherpolicy'&&req.method==='GET'){
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(policy));return;
    }
    if(process.env.MAINTENANCE_MODE!==undefined&&process.env.MAINTENANCE_MODE!=='0'&&req.method==='POST'&&route==='/unbroken/api/register'){
      res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({error:'maintenance'}));return;
    }
    const minimum=policy.platforms?.[req.headers['x-unbroken-platform']]??policy.minimumLauncherVersion;
    if(['/unbroken/api/getuserinfo','/unbroken/api/register','/unbroken/api/admission'].includes(route)&&needsUpdate(req.headers['x-unbroken-launcher-version'],minimum)){
      res.writeHead(426,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({error:'launcher_update_required',minimumLauncherVersion:minimum,message:`Update Dauntless Unbroken Launcher to ${minimum} or newer to play 1.10.5. Your account key stays the same.`}));return;
    }
    if((req.url==='/test/login'||options.publicMigration&&route==='/unbroken/api/getuserinfo')&&login){
      const automatic=route==='/unbroken/api/getuserinfo';
      const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(body));};
      if(req.method!==(automatic?'GET':'POST')){reply(405,{});return;}
      const now=Date.now(),ip=forwarded(req)['x-forwarded-for'];
      for(const [key,v] of limits)if(now-v.at>60000)limits.delete(key);
      if(!limits.has(ip)&&limits.size>=10000){reply(429,{message:'Please wait a moment and try again.'});return;}
      const entry=limits.get(ip)||{at:now,count:0};entry.count++;limits.set(ip,entry);
      if(entry.count>(local?600:60)||limits.size>10000){reply(429,{message:'Please wait a moment and try again.'});return;}
      (async()=>{
        let body='';for await(const b of req){body+=b;if(body.length>4096)throw Error('Request too large');}
        const data=automatic?{}:JSON.parse(body);
        const result=await login(req.headers['x-dauntless-unbroken-user-api-key'],data.InviteCode);
        console.log(JSON.stringify({event:'account-login',name:result.Username,imported:result.imported,ms:Date.now()-now}));
        const response=await fetch(`http://127.0.0.1:${port}/unbroken/api/GetUserInfo`,{headers:forwarded(req),signal:AbortSignal.timeout(5000)});
        if(automatic||!response.ok){
          res.writeHead(response.status,{'content-type':'application/json','cache-control':'no-store'}).end(await response.text());
        }else {await response.body?.cancel();reply(200,result);}
      })().catch(e=>{console.warn(JSON.stringify({event:'account-login-failed',message:e.message,ms:Date.now()-now}));if(!res.destroyed)reply([401,403,429,503].includes(e.status)?e.status:automatic?503:400,{message:e.message});});return;
    }
    if(req.url.startsWith('/test/')){download(req,res,port).catch(()=>{if(!res.headersSent)res.writeHead(502);res.end();});return;}
    const upstream=http.request({host:'127.0.0.1',port,path:req.url,method:req.method,headers:forwarded(req),timeout:30000},r=>{
      res.writeHead(r.statusCode,r.headers);r.pipe(res);
    });
    upstream.on('timeout',()=>upstream.destroy());
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
    req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
  });
  server.on('upgrade',(req,socket,head)=>{
    const local=options.loopback&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const chat=['/xmpp','/','//'].includes(req.url);
    if((!publicOptions&&!local&&!privateIp(req.socket.remoteAddress))||(local&&options.gatewaySecret&&!trusted(req))||(!req.url.startsWith('/ws/')&&!chat)) {socket.destroy();return;}
    const upstream=http.request({host:'127.0.0.1',port:chat?62099:port,path:chat?'//':req.url,headers:forwarded(req),timeout:10000});
    upstream.on('upgrade',(res,remote,buffer)=>{
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(res.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);
      if(head.length)remote.write(head);if(buffer.length)socket.write(buffer);
      socket.pipe(remote).pipe(socket);socket.on('error',()=>remote.destroy());remote.on('error',()=>socket.destroy());
      socket.on('close',()=>remote.destroy());remote.on('close',()=>socket.destroy());
    });
    upstream.on('timeout',()=>upstream.destroy());upstream.on('response',()=>socket.destroy());upstream.on('error',()=>socket.destroy());upstream.end();
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  return server;
}
function needsUpdate(version,minimum){
 if(typeof minimum!=='string'||!/^\d+\.\d+\.\d+$/.test(minimum))return false;
 const current=/^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(version||'');if(!current)return true;
 const floor=minimum.split('.').map(Number);for(let i=0;i<3;i++)if(Number(current[i+1])!==floor[i])return Number(current[i+1])<floor[i];
 return !!current[4];
}
module.exports={privateIp,headers,createProxy,needsUpdate};
if(require.main===module){
  const state=path.resolve(__dirname,'../../../backend-state'),hosted=path.join(state,'hosted.json');
  if(fs.existsSync(hosted)){
    const config=JSON.parse(fs.readFileSync(hosted)),Database=require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
    Object.assign(process.env,require('./maintenance-config.cjs').readMaintenance(path.join(state,'maintenance.json')));
    const db=new Database(path.join(state,'realm.db'),{fileMustExist:true,timeout:5000});
    const login=require('./migrate-on-login.cjs').createLogin(db,config.migration);
    const options={gatewaySecret:JSON.parse(fs.readFileSync(path.join(state,'secrets.json'))).gatewaySecret,publicMigration:config.migration?.requireInvite===false,policy:()=>{
      const file=path.join(state,'launcher-policy.json');
      return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{gameVersion:'1.10.5',minimumLauncherVersion:null};
    }};
    createProxy(62000,{key:fs.readFileSync(path.join(state,'public.key')),cert:fs.readFileSync(path.join(state,'public.crt')),minVersion:'TLSv1.2'},login,options).listen(62002,'0.0.0.0',()=>console.log('Public TLS gateway ready on port 62002'));
    if(config.publicRealm)createProxy(62000,null,login,{...options,loopback:true}).listen(62102,'127.0.0.1');
  }else{
  const ip=process.env.DR_1105_BIND_IP;
  if(!privateIp(ip))throw Error('Set this PC\'s Tailscale IPv4 address');
  createProxy().listen(62002,ip,()=>console.log(`Private test gateway ${ip}:62002`));
  }
}
