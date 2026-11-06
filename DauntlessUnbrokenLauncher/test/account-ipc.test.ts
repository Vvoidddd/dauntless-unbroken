import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// Exercise the actual registered callbacks: controller-only tests miss the
// IpcMainInvokeEvent that Electron prepends to every invoke argument list.
function handler(method:string,context:Record<string,unknown>){
 const source=ts.createSourceFile('main.ts',readFileSync('src/main.ts','utf8'),ts.ScriptTarget.Latest,true);
 let callback:ts.Expression|undefined;
 const visit=(node:ts.Node)=>{
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='handle'&&node.arguments[0]?.getText(source)===`IPC.${method}`)callback=node.arguments[1];
  ts.forEachChild(node,visit);
 };visit(source);assert.ok(callback);
 const compiled=ts.transpile(`(${callback.getText(source)})`,{target:ts.ScriptTarget.ES2022});
 return runInNewContext(compiled,context);
}
for(const method of ['switchAccount','removeSavedAccount'])test(`${method} IPC forwards the account ID, not the Electron event`,async()=>{
 const calls:unknown[][]=[],result={ok:true};
 const invoke=handler(method,{c:{[method]:(...args:unknown[])=>{calls.push(args);return Promise.resolve(result);}}});
 const id='a'.repeat(64),event={senderFrame:{url:'file:///launcher/index.html'}};
 assert.equal(await invoke(event,id),result);assert.deepEqual(calls,[[id]]);
});

test('clipboard import reads in main and passes text only to the existing account validator',async()=>{
 const calls:string[]=[],result={ok:true};let reads=0;
 const invoke=handler('importKeyClipboard',{clipboard:{readText:()=>{reads++;return 'private clipboard backup';}},c:{useExistingKey:(text:string)=>{calls.push(text);return Promise.resolve(result);}}});
 assert.equal(await invoke({senderFrame:{}},'renderer supplied text'),result);
 assert.equal(reads,1);assert.deepEqual(calls,['private clipboard backup']);
});

test('backup imports require explicit temporary opt-in and forward only the selected backup ID',async()=>{
 const calls:unknown[][]=[],result={ok:true};
 const invoke=handler('importKeyFile',{c:{importKeyFile:(...args:unknown[])=>{calls.push(args);return result;}}});
 const event={senderFrame:{}};
 assert.equal(invoke(event,'backup-id',true),result);
 assert.equal(invoke(event,undefined,'true'),result);
 assert.equal(invoke(event,{path:'/arbitrary'},true).ok,false);
 assert.deepEqual(calls,[['backup-id',true],[undefined,false]]);
});
