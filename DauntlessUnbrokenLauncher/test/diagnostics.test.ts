import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {diagnosticRedact,diagnosticBundle} from '../src/main/diagnostics';
import type {Snapshot} from '../src/shared/types';
test('diagnostics redact UUKs, bearer JWTs, refresh secrets, webhook tokens and local user paths',()=>{
 const hidden=['UUK_'+'a'.repeat(48),'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature123','refresh-private','webhook-secret'];
 const raw=`C:\\Users\\Slayer\\game ${hidden[0]} Authorization: Bearer ${hidden[1]} {"refresh_token":"${hidden[2]}"} https://discord.com/api/webhooks/123456789012345678/${hidden[3]}`;
 const report=diagnosticRedact(raw,['C:\\Users\\Slayer']);
 for(const value of hidden)assert.ok(!report.includes(value),value);
 assert.ok(!report.includes('Slayer'));assert.ok(report.includes('Authorization:'));
});
test('diagnostics use only bounded whitelisted launcher logs and never export keys, database or save files',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'unbroken-diagnostics-'));
 try{
  await mkdir(path.join(root,'logs'));await writeFile(path.join(root,'logs','launcher.log'),'old'.repeat(100000)+'\nUUK_'+'b'.repeat(48));
  await writeFile(path.join(root,'settings.json'),'private-settings');await writeFile(path.join(root,'key.enc'),'private-key');await writeFile(path.join(root,'account.db'),'private-save');
  const snapshot={app:{version:'1.0.16'},phase:'ready',game:{running:false},account:{hasKey:true},server:{host:'secret-host'},install:{dir:root,installed:true,missingFiles:0,verified:true,dllsOk:true},lastError:null} as Snapshot;
  const text=await diagnosticBundle(root,snapshot),result=JSON.parse(text);
  assert.equal(result.launcher,'1.0.16');assert.ok(text.length<270000);
  assert.ok(!text.includes('b'.repeat(48)));assert.ok(!text.includes('private-'));assert.ok(!text.includes('secret-host'));
  assert.deepEqual(Object.keys(result.logs),['launcher.log','launcher.old.log','steam-0.log','Archon.log']);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Linux diagnostics include the bounded Proton compatibility log',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'unbroken-diagnostics-proton-'));
 try{
  await mkdir(path.join(root,'logs'));
  await writeFile(path.join(root,'logs','steam-0.log'),'Proton: launch failed\nUUK_'+'c'.repeat(48));
  const snapshot={app:{version:'1.0.16'},phase:'ready',game:{running:false},account:{hasKey:true},server:null,install:{dir:root,installed:true,missingFiles:0,verified:true,dllsOk:true},lastError:null} as Snapshot;
  const result=JSON.parse(await diagnosticBundle(root,snapshot));
  assert.match(result.logs['steam-0.log'],/Proton: launch failed/);
  assert.doesNotMatch(result.logs['steam-0.log'],/c{48}/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Linux diagnostics include the bounded Archon game log from the installed game',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'unbroken-diagnostics-archon-'));
 try{
  await mkdir(path.join(root,'Archon','Saved','Logs'),{recursive:true});
  await writeFile(path.join(root,'Archon','Saved','Logs','Archon.log'),'Archon launch failed\nUUK_'+'d'.repeat(48));
  const snapshot={app:{version:'1.0.16'},phase:'ready',game:{running:false},account:{hasKey:true},server:null,install:{dir:root,installed:true,missingFiles:0,verified:true,dllsOk:true},lastError:null} as Snapshot;
  const result=JSON.parse(await diagnosticBundle(path.join(root,'launcher-data'),snapshot));
  assert.match(result.logs['Archon.log'],/Archon launch failed/);
  assert.doesNotMatch(result.logs['Archon.log'],/d{48}/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Linux diagnostics include the selected runtime name without its executable path',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'unbroken-diagnostics-runtime-'));
 try{
  await mkdir(path.join(root,'logs'));
  const snapshot={app:{version:'1.0.16'},phase:'ready',game:{running:false},account:{hasKey:true},server:null,install:{dir:root,installed:true,missingFiles:0,verified:true,dllsOk:true},lastError:null} as Snapshot;
  const text=await diagnosticBundle(root,snapshot,{runtimeName:'Proton (GE-Proton10-1)'}),result=JSON.parse(text);
  assert.equal(result.runtime.name,'Proton (GE-Proton10-1)');
  assert.ok(!text.includes('/home/'));
  const rejected=JSON.parse(await diagnosticBundle(root,snapshot,{runtimeName:'/home/slayer/proton'}));
  assert.equal(rejected.runtime,undefined);
 }finally{await rm(root,{recursive:true,force:true});}
});
