const http=require('node:http'),https=require('node:https');
function options(config,route,method,headers){return {hostname:config.host,port:62002,path:route,method,headers,ca:config.certificate,rejectUnauthorized:true,timeout:30000};}
function request(config,route,body,key='') {return new Promise((resolve,reject)=>{
 const bytes=body===undefined?null:Buffer.from(JSON.stringify(body));
 const req=https.request(options(config,route,bytes?'POST':'GET',{'content-type':'application/json',...(bytes?{'content-length':bytes.length}:{}),...(key?{'x-dauntless-unbroken-user-api-key':key}:{})}),res=>{
  const chunks=[];let length=0;res.on('data',b=>{length+=b.length;if(length>1024**2)req.destroy(Error('Server response too large'));else chunks.push(b);});
  res.on('error',reject);res.on('end',()=>{let data;try{data=JSON.parse(Buffer.concat(chunks));}catch{return reject(Error('Invalid server response'));}if(res.statusCode!==200)return reject(Error(data.message||`Test server returned ${res.statusCode}`));resolve(data);});
 });req.on('timeout',()=>req.destroy(Error('Test server timed out. Try again.')));req.on('error',reject);req.end(bytes);
});}
function createBridge(config,chat=false){
 // The native game speaks HTTP locally; all traffic leaving this PC uses certificate-verified TLS.
 const peers=new Set(),server=http.createServer((req,res)=>{
  const upstream=https.request(options(config,req.url,req.method,{...req.headers,host:`${config.host}:62002`}),r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);r.on('error',()=>res.destroy());});
  upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.on('aborted',()=>upstream.destroy());res.on('close',()=>upstream.destroy());req.pipe(upstream);
 });
 server.on('connection',socket=>{peers.add(socket);socket.on('close',()=>peers.delete(socket));});
 server.on('upgrade',(req,socket,head)=>{
  if(chat?!['/','//'].includes(req.url):!req.url.startsWith('/ws/'))return socket.destroy();
  const upstream=https.request(options(config,chat?'/xmpp':req.url,'GET',{...req.headers,host:`${config.host}:62002`}),res=>{res.resume();socket.destroy();});
  upstream.on('upgrade',(res,remote,buffer)=>{socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(res.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')}\r\n\r\n`);if(head.length)remote.write(head);if(buffer.length)socket.write(buffer);socket.pipe(remote).pipe(socket);socket.on('error',()=>remote.destroy());remote.on('error',()=>socket.destroy());socket.on('close',()=>remote.destroy());remote.on('close',()=>socket.destroy());});
  upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());upstream.end();
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 server.stop=()=>{for(const socket of peers)socket.destroy();server.close();};return server;
}
module.exports={request,createBridge};
