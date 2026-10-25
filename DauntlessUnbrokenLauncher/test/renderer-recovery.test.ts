import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {launcherRelaunchOptions} from '../src/main/launch';

function listener(){
 const source=ts.createSourceFile('main.ts',readFileSync('src/main.ts','utf8'),ts.ScriptTarget.Latest,true);let callback:ts.Expression|undefined;
 const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.arguments[0]&&ts.isStringLiteral(node.arguments[0])&&node.arguments[0].text==='render-process-gone')callback=node.arguments[1];ts.forEachChild(node,visit);};
 visit(source);assert.ok(callback);return ts.transpile(`(${callback.getText(source)})`,{target:ts.ScriptTarget.ES2022});
}
test('the actual renderer-crash callback never force-exits active mutations, downloads or game sessions',()=>{
 for(const state of [{busy:true},{task:{}},{game:true},{relay:true},{offline:'needs-username'},{offline:'preparing'},{offline:'stopping'},{safe:true}]){
  let exits=0,restarts=0,errors=0;
  const invoke=runInNewContext(listener(),{
   process:{argv:state.safe?['launcher','--safe-mode']:['launcher'],platform:'linux',env:{APPIMAGE:'/home/deck/Launcher.AppImage'}},
   log:{error(){}},app:{exit(){exits++;},relaunch(){restarts++;}},dialog:{showMessageBox(){errors++;return Promise.resolve({});}},launcherRelaunchOptions,
   controller:{snapshot:()=>({busy:state.busy??false,task:state.task??null,game:{running:state.game??false}}),relayActive:state.relay??false,offlineStatus:()=>({phase:state.offline??'stopped'})},
  });
  invoke({}, {reason:'crashed'});assert.equal(exits,0);assert.equal(restarts,0);assert.equal(errors,1);
 }
});
test('an idle AppImage renderer crash restarts the persistent file once in safe mode',()=>{
 let options:any,exit:any;
 const invoke=runInNewContext(listener(),{
  process:{argv:['launcher'],platform:'linux',env:{APPIMAGE:'/home/deck/Launcher.AppImage'}},log:{error(){}},
  controller:{snapshot:()=>({busy:false,task:null,game:{running:false}}),relayActive:false,offlineStatus:()=>({phase:'stopped'})},
  app:{relaunch(value:any){options=value;},exit(value:number){exit=value;}},dialog:{showMessageBox(){throw Error('Unexpected dialog');}},launcherRelaunchOptions,
 });
 invoke({}, {reason:'crashed'});assert.equal(options.execPath,'/home/deck/Launcher.AppImage');assert.deepEqual(Array.from(options.args),['--safe-mode']);assert.equal(exit,0);
});
