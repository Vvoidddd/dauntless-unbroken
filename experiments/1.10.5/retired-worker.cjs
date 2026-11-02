// Keep the old private fleet tunnel responsive until EU1 reloads its routing.
// No 1.4.4 game can be launched through this retired worker.
const http=require('node:http');
function reply(req,res){
 const snapshot=req.method==='GET'&&req.url==='/gameservers';
 res.writeHead(snapshot?200:503,{'content-type':'application/json','retry-after':'30'});
 res.end(JSON.stringify(snapshot?{servers:[],complete:true,capacity:{running:0,pending:0,limit:0,draining:true}}:{error:'capacity_unavailable',reason:'hunts'}));
}
module.exports=reply;
if(require.main===module)http.createServer(reply).listen(61001,'127.0.0.1');
