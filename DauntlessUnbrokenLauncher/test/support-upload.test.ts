import {test} from 'node:test';import assert from 'node:assert/strict';
import http from 'node:http';import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {uploadSupportReport} from '../src/main/support-upload';import type {Snapshot} from '../src/shared/types';
import {diagnosticRedact,bounded} from '../src/main/diagnostics';
test('support upload stays usable during busy registration, bounds UTF-8, redacts and sends no key in the body',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'support-upload-'));let body:any,keyHeader:unknown,bytes=0;
 const server=http.createServer((req,res)=>{let raw='';req.on('data',chunk=>{raw+=chunk;bytes+=chunk.length;});req.on('end',()=>{body=JSON.parse(raw);keyHeader=req.headers['x-dauntless-unbroken-user-api-key'];res.writeHead(201,{'content-type':'application/json'}).end(JSON.stringify({id:body.id}));});});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  await mkdir(path.join(dir,'logs'));await writeFile(path.join(dir,'logs','launcher.log'),'ERROR 🌋 test\n'.repeat(50000)+'\nInviteCode=PRIVATE-INVITE\nUUK_'+'z'.repeat(48));
  const snapshot={app:{version:'1.0.24'},phase:'register',busy:true,game:{running:false},account:{hasKey:false},server:null,install:{dir,installed:false,missingFiles:100,verified:false,dllsOk:false},lastError:{code:'server_unreachable'}} as Snapshot;
  const key='UUK_'+'a'.repeat(48),result=await uploadSupportReport({host:'127.0.0.1',port:(server.address() as any).port,pin:null},dir,snapshot,'NewSlayer',async()=>key);
  assert.equal(result.ok,true);assert.equal(keyHeader,key);assert.equal(body.attemptedName,'NewSlayer');assert.equal(body.report.state.busy,true);assert.ok(bytes<128*1024);
  for(const value of [key,'z'.repeat(48),'PRIVATE-INVITE',dir])assert.ok(!JSON.stringify(body).includes(value));
  assert.equal(await bounded(new Promise<null>(()=>{}),null,10),null);
  assert.ok(!diagnosticRedact('dauntless-unbroken://join?v=2&code=SHOULD-HIDE').includes('SHOULD-HIDE'));
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
