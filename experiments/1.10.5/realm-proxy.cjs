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
function headers(req) {
  const h={...req.headers,host:'127.0.0.1:62000','x-forwarded-for':req.socket.remoteAddress};
  delete h['x-dauntless-unbroken-gameserver-apikey'];
  delete h['x-dauntless-gateway'];
  // Never interpret a forwarded Host or client-supplied proxy header as local privilege.
  delete h.forwarded; delete h['x-real-ip']; delete h['x-forwarded-host'];
  return h;
}
function createProxy(port=62000,publicOptions=null,login=null) {
  const limits=new Map();let imports=0;
  const server=(publicOptions?https.createServer.bind(https,publicOptions):http.createServer)((req,res)=>{
    if (!publicOptions&&!privateIp(req.socket.remoteAddress)) {res.writeHead(403).end();return;}
    if(req.url==='/test/login'&&login){
      const reply=(status,body)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify(body));};
      if(req.method!=='POST'){reply(405,{});return;}
      const now=Date.now(),ip=req.socket.remoteAddress;
      for(const [key,v] of limits)if(now-v.at>60000)limits.delete(key);
      if(!limits.has(ip)&&limits.size>=10000){reply(429,{message:'Please wait a moment and try again.'});return;}
      const entry=limits.get(ip)||{at:now,count:0};entry.count++;limits.set(ip,entry);
      if(entry.count>30||imports>=2||limits.size>10000){reply(429,{message:'Please wait a moment and try again.'});return;}
      imports++;
      (async()=>{let body='';for await(const b of req){body+=b;if(body.length>4096)throw Error('Request too large');}const data=JSON.parse(body);const result=await login(req.headers['x-dauntless-unbroken-user-api-key'],data.InviteCode);console.log(JSON.stringify({event:'test-login',name:result.Username,imported:result.imported,ms:Date.now()-now}));reply(200,result);})().catch(e=>{console.warn(JSON.stringify({event:'test-login-failed',message:e.message,ms:Date.now()-now}));if(!res.destroyed)reply(400,{message:e.message});}).finally(()=>imports--);return;
    }
    if(req.url.startsWith('/test/')){download(req,res,port).catch(()=>{if(!res.headersSent)res.writeHead(502);res.end();});return;}
    const upstream=http.request({host:'127.0.0.1',port,path:req.url,method:req.method,headers:headers(req),timeout:30000},r=>{
      res.writeHead(r.statusCode,r.headers);r.pipe(res);
    });
    upstream.on('timeout',()=>upstream.destroy());
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
    req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
  });
  server.on('upgrade',(req,socket,head)=>{
    if((!publicOptions&&!privateIp(req.socket.remoteAddress))||(!req.url.startsWith('/ws/')&&req.url!=='/xmpp')) {socket.destroy();return;}
    const upstream=http.request({host:'127.0.0.1',port:req.url==='/xmpp'?62099:port,path:req.url==='/xmpp'?'//':req.url,headers:headers(req),timeout:10000});
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
module.exports={privateIp,headers,createProxy};
if(require.main===module){
  const state=path.resolve(__dirname,'../../../backend-state'),hosted=path.join(state,'hosted.json');
  if(fs.existsSync(hosted)){
    const config=JSON.parse(fs.readFileSync(hosted)),Database=require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
    const db=new Database(path.join(state,'realm.db'),{fileMustExist:true,timeout:5000});
    const login=require('./migrate-on-login.cjs').createLogin(db,config.migration);
    createProxy(62000,{key:fs.readFileSync(path.join(state,'public.key')),cert:fs.readFileSync(path.join(state,'public.crt')),minVersion:'TLSv1.2'},login).listen(62002,'0.0.0.0',()=>console.log('Public TLS test gateway ready on port 62002'));
  }else{
  const ip=process.env.DR_1105_BIND_IP;
  if(!privateIp(ip))throw Error('Set this PC\'s Tailscale IPv4 address');
  createProxy().listen(62002,ip,()=>console.log(`Private test gateway ${ip}:62002`));
  }
}
