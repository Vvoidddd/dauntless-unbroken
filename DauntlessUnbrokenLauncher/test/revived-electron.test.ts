import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import path from 'node:path';

test('cleanup removes real ASAR archives under Electron without traversing archive contents',{skip:process.platform!=='win32',timeout:45000},async()=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const result=await new Promise<{error:Error|null;stdout:string;stderr:string}>(resolve=>{
  execFile(require('electron'),[path.resolve('test/fixtures/revived-asar.cjs')],{env,windowsHide:true,timeout:40000},(error,stdout,stderr)=>resolve({error,stdout,stderr}));
 });
 assert.equal(result.error,null,result.stdout+'\n'+result.stderr);
 assert.match(result.stdout,/PASS: two physical ASAR archives removed/);
});
