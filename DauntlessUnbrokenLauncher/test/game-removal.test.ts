import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {gameRemovalTargets,removeGameFiles} from '../src/main/game-removal';
import type {GameManifest} from '../src/main/manifest';

const manifest:GameManifest={build:'test',totalBytes:0,files:['Archon/Binaries/Win64/Game.exe','Archon/Content/game.pak','Engine/Binaries/file','Version.txt'].map(path=>({path,size:0,sha256:'0'.repeat(64)}))};
async function fixture(t:any){
  const base=await fs.mkdtemp(path.join(tmpdir(),'unbroken-remove-game-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const root=path.join(base,'game'),profile=path.join(base,'profile'),trash=path.join(base,'trash');
  for(const file of [...manifest.files.map(f=>path.join(root,f.path)),path.join(root,'Archon/Saved/save.ini'),path.join(root,'personal.txt'),path.join(profile,'account.key')]){
    await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'keep');
  }
  await fs.mkdir(trash);
  return {base,root,profile,trash};
}
test('game removal moves game content to trash, preserving saves, profiles and unrelated files',async t=>{
  const h=await fixture(t);let confirmations=0;
  assert.equal(await removeGameFiles(h.root,manifest,[h.profile],async targets=>{confirmations++;assert.equal(targets.length,4);return true;},target=>fs.rename(target,path.join(h.trash,String(confirmations++)+path.basename(target)))),true);
  await assert.rejects(fs.stat(path.join(h.root,'Archon/Binaries')),{code:'ENOENT'});
  for(const file of [path.join(h.root,'Archon/Saved/save.ini'),path.join(h.root,'personal.txt'),path.join(h.profile,'account.key')])assert.equal(await fs.readFile(file,'utf8'),'keep');
  assert.equal((await fs.readdir(h.trash)).length,4);
});
test('cancel, linked targets, protected paths and targets changed during confirmation never move files',async t=>{
  const h=await fixture(t);let moved=0;
  const trash=async()=>{moved++;};
  assert.equal(await removeGameFiles(h.root,manifest,[],async()=>false,trash),false);
  await assert.rejects(gameRemovalTargets(h.root,manifest,[path.join(h.root,'Engine')]),/protected/);
  await assert.rejects(gameRemovalTargets(path.parse(h.root).root,manifest,[]),/filesystem root/);
  await assert.rejects(removeGameFiles(h.root,manifest,[],async()=>{await fs.rename(path.join(h.root,'Engine'),path.join(h.root,'Engine-old'));return true;},trash),/changed/);
  await fs.symlink(h.profile,path.join(h.root,'Engine'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(removeGameFiles(h.root,manifest,[],async()=>true,trash),/linked/);
  assert.equal(moved,0);assert.equal(await fs.readFile(path.join(h.profile,'account.key'),'utf8'),'keep');
});
test('a canonical parent alias is accepted while a linked game root is refused',async t=>{
  const h=await fixture(t),alias=path.join(h.base,'parent-alias');
  await fs.symlink(h.base,alias,process.platform==='win32'?'junction':'dir');
  assert.deepEqual(await gameRemovalTargets(path.join(alias,'game'),manifest,[h.profile]),await gameRemovalTargets(h.root,manifest,[h.profile]));
  const linkedRoot=path.join(h.base,'linked-game');await fs.symlink(h.root,linkedRoot,process.platform==='win32'?'junction':'dir');
  await assert.rejects(gameRemovalTargets(linkedRoot,manifest,[]),/linked/);
});
