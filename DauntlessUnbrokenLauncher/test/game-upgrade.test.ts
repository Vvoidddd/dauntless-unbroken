import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {prepareGameUpgrade,installHostedGame,GAME_DOWNLOAD_BASE_URL} from '../src/main/game-upgrade';
import {DownloadJob} from '../src/main/downloader';
test('hosted game uses R2, forwards only needed pinned files, and cancels its downloader',async t=>{
 const files=[{path:'Archon/test.pak',size:4,sha256:'a'.repeat(64)}];
 const abort=new AbortController();let cancelled=false,ran=false;
 t.mock.method(DownloadJob.prototype,'cancel',()=>{cancelled=true;});
 t.mock.method(DownloadJob.prototype,'run',async function(this:any){
  ran=true;assert.equal(this.opts.downloadBaseUrl,'https://downloads.voidvault.xyz/1.10.5/');
  assert.equal(this.opts.key,'');assert.deepEqual(this.opts.files,files);
  this.opts.onProgress({currentFile:'Archon/test.pak',doneBytes:2,totalBytes:4});abort.abort();
 });
 let progress:any;
 await installHostedGame('unused',abort.signal,p=>{progress=p;},files);
 assert.ok(ran&&cancelled);assert.equal(progress.kind,'download');assert.equal(progress.currentFile,'Archon/test.pak');
 assert.equal(new URL(GAME_DOWNLOAD_BASE_URL).protocol,'https:');
});
test('game upgrade refuses unknown builds and preserves an older install',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'unbroken-upgrade-'));
 try{
  const oldDir=path.join(root,'old'),newDir=path.join(root,'new'),record=path.join(root,'upgrade.json');
  const exe='Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe';
  await fs.mkdir(path.dirname(path.join(oldDir,exe)),{recursive:true});await fs.writeFile(path.join(oldDir,exe),'unknown');
  await assert.rejects(prepareGameUpgrade(record,oldDir,async()=>{throw Error('Unexpected prompt');}),/unrecognized/);
  assert.equal(await fs.readFile(path.join(oldDir,exe),'utf8'),'unknown');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('resuming an older upgrade record never removes the previous game',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'unbroken-upgrade-resume-'));
 try{
  const oldDir=path.join(root,'old'),newDir=path.join(root,'new'),record=path.join(root,'upgrade.json');
  const exe='Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe';
  await fs.mkdir(path.dirname(path.join(oldDir,exe)),{recursive:true});await fs.writeFile(path.join(oldDir,exe),'existing game');
  await fs.writeFile(record,JSON.stringify({oldDir,newDir,removeOld:true}));
  assert.equal(await prepareGameUpgrade(record,oldDir,async()=>{throw Error('Existing upgrade should resume');}),newDir);
  assert.equal(await fs.readFile(path.join(oldDir,exe),'utf8'),'existing game');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
