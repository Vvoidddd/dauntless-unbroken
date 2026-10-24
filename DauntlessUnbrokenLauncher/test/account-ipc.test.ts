import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';

// Exercise the actual registered callbacks: controller-only tests miss the
// IpcMainInvokeEvent that Electron prepends to every invoke argument list.
for(const method of ['switchAccount','removeSavedAccount'])test(`${method} IPC forwards the account ID, not the Electron event`,async()=>{
 const source=ts.createSourceFile('main.ts',readFileSync('src/main.ts','utf8'),ts.ScriptTarget.Latest,true);
 let callback:ts.Expression|undefined;
 const visit=(node:ts.Node)=>{
  if(ts.isCallExpression(node)&&node.expression.getText(source)==='handle'&&node.arguments[0]?.getText(source)===`IPC.${method}`)callback=node.arguments[1];
  ts.forEachChild(node,visit);
 };visit(source);assert.ok(callback);
 const calls:unknown[][]=[],result={ok:true};
 const compiled=ts.transpile(`(${callback.getText(source)})`,{target:ts.ScriptTarget.ES2022});
 const invoke=runInNewContext(compiled,{c:{[method]:(...args:unknown[])=>{calls.push(args);return Promise.resolve(result);}}});
 const id='a'.repeat(64),event={senderFrame:{url:'file:///launcher/index.html'}};
 assert.equal(await invoke(event,id),result);assert.deepEqual(calls,[[id]]);
});
