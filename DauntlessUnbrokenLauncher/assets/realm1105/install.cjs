const fs=require('node:fs'), fsp=fs.promises, path=require('node:path'), crypto=require('node:crypto');
const {promisify}=require('node:util'), inflate=promisify(require('node:zlib').inflate);
const {setTimeout:delay}=require('node:timers/promises');
const MANIFEST_URL='https://raw.githubusercontent.com/addison2k/DauntlessManifestArchive/main/manifests/Windows/Dauntless_1.10.5.365075.manifest';
const MANIFEST_SHA='a31648745d9e41016aaa6ed9a16d1eabab85ec7d';
const CDN_PATH='/Builds/Org/o-krlzxj88qrtb69fredeuaf887bl5az/Jackal/default';
const CDNS=['https://epicgames-download1.akamaized.net','https://egs-cloudfront-chunks.epicgamescdn.com','https://egdownload.fastly-edge.com'];
const sha=data=>crypto.createHash('sha1').update(data).digest('hex');
async function digest(file,algorithm='sha1'){const h=crypto.createHash(algorithm);for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
function inside(root,name){
 if(typeof name!=='string'||name.includes('\\')||name.split('/').some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[. ]$/.test(p)||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(p)))throw Error('Unsafe manifest path');
 const full=path.resolve(root,name);if(!full.startsWith(path.resolve(root)+path.sep))throw Error('Path outside game installation');return full;
}
async function safePath(root,name){
 const full=inside(root,name);let current=path.resolve(root);
 for(const component of path.relative(current,full).split(path.sep)){
  current=path.join(current,component);const s=await fsp.lstat(current).catch(e=>{if(e.code!=='ENOENT')throw e;});
  if(s?.isSymbolicLink())throw Error(`Remove the linked path before installing: ${current}`);
 }
 return full;
}
function validateIndex(index){
 if(index.version!=='1.10.5.365075'||!Array.isArray(index.files)||!index.files.length||!index.chunks)throw Error('Invalid install index');
 const seen=new Set();
 for(const f of index.files){
  inside(path.resolve('.'),f.path);if(seen.has(f.path.toLowerCase()))throw Error('Duplicate manifest path');seen.add(f.path.toLowerCase());
  if(!Number.isSafeInteger(f.size)||f.size<0||!/^[a-f0-9]{40}$/.test(f.sha)||!Array.isArray(f.parts))throw Error('Invalid file metadata');
  let size=0;for(const [id,offset,n] of f.parts){const c=index.chunks[id];
   if(!/^[a-f0-9-]{36}$/.test(id)||!c||!/^\/ChunksV[234]\/\d{2}\/\w+\.chunk$/.test(c.path)||!/^[a-f0-9]{40}$/.test(c.sha)||!Number.isSafeInteger(c.size)||c.size<41||c.size>4*1024**2||!Number.isSafeInteger(offset)||!Number.isSafeInteger(n)||offset<0||n<0||offset+n>4*1024**2)throw Error('Invalid chunk metadata');size+=n;
  }if(size!==f.size)throw Error('Manifest file size mismatch');
 }
}
async function readURL(url,maxBytes,signal){
 const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(45000)]),redirect:'error'});
 if(!response.ok){await response.body?.cancel();throw Error(`Download returned HTTP ${response.status}`);}
 let size=0;const pieces=[];for await(const b of response.body){size+=b.length;if(size>maxBytes)throw Error('Download exceeded expected size');pieces.push(b);}return Buffer.concat(pieces);
}
async function decodeChunk(raw,entry){
 if(raw.length!==entry.size||raw.length<41||raw.readUInt32LE(0)!==0xb1fe3aa2)throw Error('Invalid Epic chunk header');
 const header=raw.readUInt32LE(8),size=raw.readUInt32LE(12),flags=raw[40];
 if(header<41||header>raw.length||header+size!==raw.length||flags>1)throw Error('Unsupported or incomplete Epic chunk');
 const body=raw.subarray(header),data=flags===1?await inflate(body,{maxOutputLength:4*1024**2}):body;
 if(sha(data)!==entry.sha)throw Error('Chunk checksum mismatch');return data;
}
async function install(index,folder,{signal=new AbortController().signal,onProgress=()=>{},fetchChunk,checkManifest=true}={}){
 validateIndex(index);await fsp.mkdir(folder,{recursive:true});folder=await fsp.realpath(folder);
 if(checkManifest){onProgress({phase:'manifest',detail:'Checking the 1.10.5 manifest from GitHub…'});if(sha(await readURL(MANIFEST_URL,4*1024**2,signal))!==MANIFEST_SHA)throw Error('The GitHub manifest does not match 1.10.5.');}
 const total=index.files.reduce((n,f)=>n+f.size,0);let done=0,finished=0,last=0;
 const emit=(phase,file,force=false)=>{if(force||Date.now()-last>200){last=Date.now();onProgress({phase,file,done,total,finished,files:index.files.length});}};
 const cache=await safePath(folder,'.unbroken-chunks');await fsp.mkdir(cache,{recursive:true});
 const pending=new Map();
 async function chunk(id,file){
  if(pending.has(id))return pending.get(id);
  const task=(async()=>{
   const entry=index.chunks[id],cached=await safePath(folder,`.unbroken-chunks/${id}`);
   const stat=await fsp.stat(cached).catch(()=>null);
   if(stat?.isFile()&&stat.size<=4*1024**2){const data=await fsp.readFile(cached);if(sha(data)===entry.sha)return data;}
   let error;
   for(let attempt=0;attempt<4;attempt++){
    signal.throwIfAborted();try{
     emit('downloading',file);
     const data=await decodeChunk(await (fetchChunk?fetchChunk(entry,signal):readURL(CDNS[attempt%CDNS.length]+CDN_PATH+entry.path,entry.size,signal)),entry);
     const temp=await safePath(folder,`.unbroken-chunks/${id}.tmp`);await fsp.writeFile(temp,data);await fsp.rename(temp,cached);return data;
    }catch(e){error=e;if(signal.aborted)throw e;if(attempt<3){onProgress({phase:'retry',file,detail:`Retry ${attempt+1}/3 · ${e.message}`,done,total});await delay(500*2**attempt,undefined,{signal});}}
   }throw Error(`${file}: ${error.message}. Press Download / repair to resume.`);
  })();pending.set(id,task);try{return await task;}finally{pending.delete(id);}
 }
 for(const file of index.files){
  signal.throwIfAborted();const target=await safePath(folder,file.path);emit('checking',file.path,true);
  const stat=await fsp.stat(target).catch(()=>null);
  if(stat?.isFile()&&stat.size===file.size&&await digest(target)===file.sha){done+=file.size;finished++;emit('verified',file.path,true);continue;}
  const disk=await fsp.statfs(folder);if(Number(disk.bavail)*Number(disk.bsize)<file.size*2+512*1024**2)throw Error(`Not enough free space to finish ${file.path}. Free space and resume.`);
  await fsp.mkdir(path.dirname(target),{recursive:true});const temporary=await safePath(folder,file.path+'.unbroken-partial');
  const output=await fsp.open(temporary,'w');let cursor=0,offset=0,failure,firstWrite=true;const parts=file.parts.map(p=>{const task={id:p[0],start:p[1],length:p[2],position:offset};offset+=p[2];return task;});
  emit('downloading',file.path,true);
  try{
   // ponytail: eight in-flight chunks, one file at a time; bounded RAM and no whole-game ZIP/cache.
   await Promise.all(Array.from({length:Math.min(8,parts.length)},async()=>{
    try{while(cursor<parts.length&&!failure){signal.throwIfAborted();const p=parts[cursor++],data=await chunk(p.id,file.path);
     if(p.start+p.length>data.length)throw Error('Chunk part outside verified data');
     let written=0;while(written<p.length){const r=await output.write(data,p.start+written,p.length-written,p.position+written);if(!r.bytesWritten)throw Error('Disk write stopped');written+=r.bytesWritten;}
     done+=p.length;emit('unpacking',file.path,firstWrite);firstWrite=false;
    }}catch(e){failure=e;}
   }));if(failure)throw failure;await output.sync();
  }finally{await output.close();}
  emit('checking',file.path,true);if(await digest(temporary)!==file.sha)throw Error(`File verification failed: ${file.path}`);
  await fsp.rename(temporary,target);finished++;emit('verified',file.path,true);
  for(const id of new Set(parts.map(p=>p.id)))await fsp.unlink(await safePath(folder,`.unbroken-chunks/${id}`)).catch(e=>{if(e.code!=='ENOENT')throw e;});
 }
 onProgress({phase:'complete',done:total,total,finished,files:index.files.length,detail:'All game files verified. Ready to play.'});
}
module.exports={install,validateIndex,inside,decodeChunk,digest,MANIFEST_URL,MANIFEST_SHA};
