// Run build-launcher.cjs --stage-only first. --cdn checks representative real Epic files.
const assert=require('node:assert/strict'),fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),zlib=require('node:zlib');
const stage=path.resolve(__dirname,'../../../test-launcher-stage');
const {Accounts,inviteCode}=require(path.join(stage,'accounts.cjs'));
const {backupFileText,extractAccountKey}=require(path.join(stage,'shared.cjs'));
const {install,decodeChunk,inside}=require('./launcher/install.cjs');
const hash=b=>crypto.createHash('sha1').update(b).digest('hex');
async function main(){
 const html=fs.readFileSync(path.join(__dirname,'launcher/index.html'),'utf8'),fieldIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(fieldIds).size,fieldIds.length,'Each form field must have a unique ID');
 assert.match(html,/No Tailscale or VPN needed/);
 // A failed first login must expose the invite error and allow retrying the same key.
 const fields=Object.fromEntries(fieldIds.map(id=>[id,{value:'',hidden:false,textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},scrollIntoView(){this.scrolled=true;},focus(){this.focused=true;},replaceChildren(){}}]));
 let attempts=0;const loginCalls=[],api={action:async(action,value)=>{if(action==='status')return {state:{accounts:[]}};loginCalls.push({action,value});return ++attempts===1?{ok:false,error:'Paste a new 1.10.5 test invite to copy your live account.',state:{accounts:[]}}:{ok:true,state:{accounts:[]}};},progress(){},state(){}};
 require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname,'launcher/renderer.js'),'utf8'),{document:{getElementById:id=>fields[id],querySelectorAll:()=>[]},window:{lab:api}});
 fields.key.value='fixture-key';await fields.signin.onclick();
 assert.equal(fields.error.hidden,false);assert.match(fields.error.textContent,/test invite/);assert.ok(fields.error.scrolled);assert.ok(fields.invite.focused);assert.equal(fields.key.value,'fixture-key');
 fields.invite.value='ABCD-EFGH-IJKL';await fields.signin.onclick();
 assert.equal(loginCalls[1].value.key,'fixture-key');assert.equal(loginCalls[1].value.invite,'ABCD-EFGH-IJKL');assert.equal(fields.key.value,'');assert.equal(fields.error.hidden,true);
 const encryptionKey=crypto.randomBytes(32),secure={isEncryptionAvailable:()=>true,encryptString(text){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',encryptionKey,iv),body=Buffer.concat([c.update(text),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);},decryptString(data){const c=crypto.createDecipheriv('aes-256-gcm',encryptionKey,data.subarray(0,12));c.setAuthTag(data.subarray(12,28));return Buffer.concat([c.update(data.subarray(28)),c.final()]).toString();}};
 const keyA='UUK_'+crypto.randomBytes(24).toString('hex'),keyB='UUK-'+crypto.randomBytes(32).toString('hex');
 const state={key:secure.encryptString(keyA).toString('base64'),name:'TesterA',uid:'UID-A',folder:'existing-game'};let persisted;
 const lookup=async k=>{if(k===keyA)return {Username:'TesterA',UserId:'UID-A'};if(k===keyB)return {Username:'TesterB',UserId:'UID-B'};throw Error('Unauthorized');};
 let account=new Accounts(state,secure,()=>persisted=JSON.stringify(state),lookup);
 assert.equal(account.key,keyA);assert.ok(!persisted.includes(keyA));assert.equal(state.folder,'existing-game');
 const backup=backupFileText({key:keyB,username:'TesterB',serverName:'Dauntless Unbroken 1.10.5 Test',host:'100.69.103.30',port:62002,fingerprint:null,date:new Date()});
 assert.match(backup,/^Dauntless Unbroken account key/);assert.equal(extractAccountKey(backup),keyB);
 await account.login(backup);assert.equal(account.key,keyB);await assert.rejects(account.login('bad-but-plausible'),/Unauthorized/);assert.equal(account.key,keyB);
 account.logout();assert.equal(account.key,'');assert.equal(account.list().length,2);assert.equal(state.folder,'existing-game');
 await account.switch(account.list().find(a=>a.name==='TesterA').id);assert.equal(account.key,keyA);
 account=new Accounts(JSON.parse(persisted),secure,()=>{},lookup);assert.equal(account.key,keyA);assert.ok(!JSON.stringify(account.list()).includes('UUK'));
 account.remove(account.current.id);assert.equal(account.key,'');await account.switch(account.list()[0].id);assert.equal(account.key,keyB);
 const link='dauntless-unbroken://join?'+new URLSearchParams({v:'1',host:'100.69.103.30',port:'62002',code:'ABCD-EFGH-IJKL',name:'Dauntless Unbroken 1.10.5 Test'});
 assert.equal(inviteCode(link,'100.69.103.30'),'ABCD-EFGH-IJKL');assert.throws(()=>inviteCode(link,'100.70.1.1'),/different realm/);assert.throws(()=>inviteCode(link+'&code=evil','100.69.103.30'));assert.throws(()=>inside('C:/test','../escape'));assert.throws(()=>inside('C:/test','file:stream'));
 const fingerprint='ab'.repeat(32),publicLink='dauntless-unbroken://join?'+new URLSearchParams({v:'2',mode:'public',host:'82.153.118.185',port:'62002',fp:fingerprint,code:'ABCD-EFGH-IJKL',name:'Dauntless Unbroken 1.10.5 Test'});
 assert.equal(inviteCode(publicLink,'82.153.118.185',fingerprint),'ABCD-EFGH-IJKL');assert.throws(()=>inviteCode(publicLink,'82.153.118.185','cd'.repeat(32)),/different realm/);
 const root=await fsp.mkdtemp(path.join(os.tmpdir(),'unbroken-download-'));
 const content=[Buffer.from('plain bytes from CDN'),Buffer.from('compressed data '.repeat(300))],chunks={},raw={},ids=['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222'];
 for(let i=0;i<2;i++){const payload=i?zlib.deflateSync(content[i]):content[i],header=Buffer.alloc(41);header.writeUInt32LE(0xb1fe3aa2,0);header.writeUInt32LE(41,8);header.writeUInt32LE(payload.length,12);header[40]=i;raw[ids[i]]=Buffer.concat([header,payload]);chunks[ids[i]]={path:`/ChunksV4/01/${ids[i].replaceAll('-','')}.chunk`,size:raw[ids[i]].length,sha:hash(content[i])};assert.deepEqual(await decodeChunk(raw[ids[i]],chunks[ids[i]]),content[i]);}
 const bytes=Buffer.concat(content),index={version:'1.10.5.365075',chunks,files:[{path:'Archon/Content/test.pak',size:bytes.length,sha:hash(bytes),parts:ids.map((id,i)=>[id,0,content[i].length])}]};
 let calls=0;const events=[],fetchChunk=async entry=>{calls++;return raw[Object.keys(chunks).find(id=>chunks[id]===entry)];};
 try{
  await install(index,root,{checkManifest:false,fetchChunk,onProgress:e=>events.push(e)});assert.deepEqual(await fsp.readFile(path.join(root,index.files[0].path)),bytes);assert.ok(events.some(e=>e.phase==='downloading'&&e.file===index.files[0].path));assert.ok(events.some(e=>e.phase==='unpacking'));
  await install(index,root,{checkManifest:false,fetchChunk});assert.equal(calls,2,'Verified files must not download again');
  await fsp.writeFile(path.join(root,index.files[0].path),'corrupt');await install(index,root,{checkManifest:false,fetchChunk});assert.deepEqual(await fsp.readFile(path.join(root,index.files[0].path)),bytes);
  await assert.rejects(decodeChunk(Buffer.alloc(raw[ids[0]].length),chunks[ids[0]]),/header/);
  // Resume after a failed chunk: one good cache entry survives, corrupt cache gets repaired.
  await fsp.unlink(path.join(root,index.files[0].path));await fsp.writeFile(path.join(root,'.unbroken-chunks',ids[0]),content[0]);await fsp.writeFile(path.join(root,'.unbroken-chunks',ids[1]),'broken');calls=0;
  await install(index,root,{checkManifest:false,fetchChunk});assert.equal(calls,1);assert.deepEqual(await fsp.readFile(path.join(root,index.files[0].path)),bytes);
 }finally{await fsp.rm(root,{recursive:true,force:true});}
 console.log('Account switching/logout/restart, branded backups/invites, path guards, plain/compressed chunks, checksums and resume passed.');
 if(process.argv.includes('--cdn')||process.argv.includes('--full-download')){
  const all=JSON.parse(fs.readFileSync(path.join(stage,'install-index.json')));if(!process.argv.includes('--full-download'))all.files=all.files.filter(f=>/Dauntless-Win64-Shipping.exe$|api-ms-win-core-console-l1-1-0.dll$|Archon_Audio_3-WindowsClient.pak$/.test(f.path));
  let last=0;await install(all,path.resolve(__dirname,'../../../download-verification/Unbroken1105Game'),{onProgress:e=>{if(Date.now()-last>5000||e.phase==='complete'){last=Date.now();console.log(JSON.stringify(e));}}});console.log('Epic CDN install and final file hashes passed.');
 }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
