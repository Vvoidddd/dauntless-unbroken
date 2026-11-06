import { promises as fs } from 'node:fs';
import path from 'node:path';
import { DownloadJob } from './downloader';
import {log} from './log';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import type { ManifestFile } from './manifest';
import type { TaskProgress } from '../shared/types';

const EXE = 'Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe';
const OLD_HASH = 'd3d41e614908d2befd518b27046d9822d6130ef12ba3504babbdb786bef9cff4';
export const NEW_HASH = '41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd';
async function hash(file:string):Promise<string|null> {
  try { const h=createHash('sha256'); for await(const b of createReadStream(file))h.update(b); return h.digest('hex'); }
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
type Upgrade = { oldDir:string; newDir:string };
async function load(file:string):Promise<Upgrade|null>{
  try {
    const v=JSON.parse(await fs.readFile(file,'utf8'));
    if(!v||typeof v.oldDir!=='string'||!path.isAbsolute(v.oldDir)||typeof v.newDir!=='string'||!path.isAbsolute(v.newDir)||(v.removeOld!==undefined&&typeof v.removeOld!=='boolean'))throw Error('Invalid game upgrade record');
    return v;
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}

// Keep the existing launcher profile and keys; only the game directory changes.
export async function prepareGameUpgrade(record:string,selected:string,inform:(oldDir:string,newDir:string)=>Promise<void>):Promise<string>{
  const old=await load(record);
  if(old&&path.resolve(selected)===old.oldDir){
    const target=await hash(path.join(old.newDir,EXE));
    if(target&&target!==NEW_HASH)throw Error('The upgrade destination contains a different game. Choose another folder.');
    return old.newDir;
  }
  const digest=await hash(path.join(selected,EXE));
  if(!digest||digest===NEW_HASH)return selected;
  if(digest!==OLD_HASH)throw Error('This folder contains an unrecognized game build. Choose an empty folder for 1.10.5.');
  const newDir=path.join(path.dirname(path.resolve(selected)),path.basename(selected)+'-1.10.5');
  if(newDir.length>150)throw Error('Choose a shorter installation path for 1.10.5.');
  const target=await hash(path.join(newDir,EXE));
  if(target&&target!==NEW_HASH)throw Error('The 1.10.5 destination already contains a different game. Choose another folder.');
  await inform(selected,newDir);
  await fs.mkdir(path.dirname(record),{recursive:true});
  await fs.writeFile(record+'.tmp',JSON.stringify({oldDir:path.resolve(selected),newDir}));
  await fs.rename(record+'.tmp',record);
  return newDir;
}

export const GAME_DOWNLOAD_BASE_URL='https://downloads.voidvault.xyz/1.10.5/';
export async function installHostedGame(dir:string,signal:AbortSignal,progress:(p:TaskProgress)=>void,files:ManifestFile[]):Promise<void>{
  // Reuse the resumable downloader and the launcher's pinned SHA-256 manifest.
  // CDN requests never carry account keys or the game gateway's certificate pin.
  const job=new DownloadJob({endpoint:{host:'127.0.0.1',port:0,pin:null},key:'',
    downloadBaseUrl:GAME_DOWNLOAD_BASE_URL,installDir:dir,files,
    onRetry:(file,attempt,reason)=>log.warn(`CDN retry ${attempt} for ${file.path}: ${reason}`),
    onProgress:p=>progress({kind:'download',...p})});
  const cancel=()=>job.cancel();
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted)cancel();
  try{await job.run();}finally{signal.removeEventListener('abort',cancel);}
}
