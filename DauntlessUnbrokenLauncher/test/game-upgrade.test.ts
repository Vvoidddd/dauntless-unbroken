import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {prepareGameUpgrade,finishGameUpgrade} from '../src/main/game-upgrade';
test('game upgrade refuses unknown builds and never removes old files before full verification',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'unbroken-upgrade-'));
 try{
  const oldDir=path.join(root,'old'),newDir=path.join(root,'new'),record=path.join(root,'upgrade.json');
  const exe='Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe';
  await fs.mkdir(path.dirname(path.join(oldDir,exe)),{recursive:true});await fs.writeFile(path.join(oldDir,exe),'unknown');
  await assert.rejects(prepareGameUpgrade(record,oldDir,async()=>{throw Error('Unexpected prompt');}),/unrecognized/);
  await fs.writeFile(record,JSON.stringify({oldDir,newDir,removeOld:true}));let deleted=false;
  await assert.rejects(finishGameUpgrade(record,newDir,{files:[]} as any,{files:[]} as any,[],async()=>{deleted=true;}),/Verify 1.10.5/);
  assert.equal(deleted,false);assert.equal(await fs.readFile(path.join(oldDir,exe),'utf8'),'unknown');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
