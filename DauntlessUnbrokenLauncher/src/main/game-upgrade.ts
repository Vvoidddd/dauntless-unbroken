import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { removeGameFiles } from './game-removal';
import {verifyInstall} from './verify';
import type { GameManifest } from './manifest';
import type { TaskProgress } from '../shared/types';

const EXE = 'Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe';
const OLD_HASH = 'd3d41e614908d2befd518b27046d9822d6130ef12ba3504babbdb786bef9cff4';
export const NEW_HASH = '41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd';
async function hash(file:string):Promise<string|null> {
  try { const h=createHash('sha256'); for await(const b of createReadStream(file))h.update(b); return h.digest('hex'); }
  catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
type Upgrade = { oldDir:string; newDir:string; removeOld:boolean };
async function load(file:string):Promise<Upgrade|null>{
  try {
    const v=JSON.parse(await fs.readFile(file,'utf8'));
    if(!v||typeof v.oldDir!=='string'||!path.isAbsolute(v.oldDir)||typeof v.newDir!=='string'||!path.isAbsolute(v.newDir)||typeof v.removeOld!=='boolean')throw Error('Invalid game upgrade record');
    return v;
  }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}

// Keep the existing launcher profile and keys; only the game directory changes.
export async function prepareGameUpgrade(record:string,selected:string,choose:(oldDir:string,newDir:string)=>Promise<'keep'|'remove'>):Promise<string>{
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
  const removeOld=await choose(selected,newDir)==='remove';
  await fs.mkdir(path.dirname(record),{recursive:true});
  await fs.writeFile(record+'.tmp',JSON.stringify({oldDir:path.resolve(selected),newDir,removeOld}));
  await fs.rename(record+'.tmp',record);
  return newDir;
}

export async function finishGameUpgrade(record:string,current:string,legacy:GameManifest,next:GameManifest,protectedPaths:string[],trash:(file:string)=>Promise<void>):Promise<void>{
  const saved=await load(record);
  if(!saved?.removeOld||path.resolve(current)!==saved.newDir)return;
  // Called only after the new manifest verifies. Refuse changed/shared content.
  if(await hash(path.join(current,EXE))!==NEW_HASH)throw Error('Verify 1.10.5 before removing 1.4.4.');
  if((await verifyInstall(current,next.files,{fullHash:true})).bad.length)throw Error('New game verification failed; the old game was kept.');
  const oldHash=await hash(path.join(saved.oldDir,EXE));
  if(oldHash&&oldHash!==OLD_HASH)throw Error('The old game changed; cleanup was skipped.');
  await removeGameFiles(saved.oldDir,legacy,[current,...protectedPaths],async()=>true,trash);
  await fs.writeFile(record+'.tmp',JSON.stringify({...saved,removeOld:false}));
  await fs.rename(record+'.tmp',record);
}

export async function installArchivedGame(resources:string,dir:string,signal:AbortSignal,progress:(p:TaskProgress)=>void):Promise<void>{
  const folder=path.join(resources,'realm1105');
  const installer=createRequire(path.join(folder,'install.cjs'))('./install.cjs');
  const index=JSON.parse(await fs.readFile(path.join(folder,'install-index.json'),'utf8'));
  await installer.install(index,dir,{signal,onProgress:(p:{phase:string;file?:string;detail?:string;done?:number;total?:number;finished?:number;files?:number})=>progress({
    kind:p.phase==='checking'||p.phase==='verified'?'verify':p.phase==='unpacking'?'unpack':'download',paused:false,
    totalBytes:p.total??0,doneBytes:p.done??0,filesTotal:p.files??606,filesDone:p.finished??0,
    bytesPerSecond:0,etaSeconds:null,currentFile:p.file??p.detail??null,
  })});
}
