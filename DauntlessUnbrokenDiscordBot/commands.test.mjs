import assert from 'node:assert/strict';
import {test} from 'node:test';
import {keyCommand,moderationCommands,syncKeyCommands} from './commands.mjs';
test('unchanged global and guild commands preserve their IDs',async()=>{
  const rest={get:async route=>(route.includes('/guilds/')?[keyCommand,...moderationCommands]:[keyCommand]).map((c,i)=>({...c,id:String(i),type:1})),
    post:async()=>assert.fail('no replacement'),patch:async()=>assert.fail('no patch')};
  assert.equal(await syncKeyCommands(rest,'app',['guild','guild']),0);
});
test('missing guild commands are registered without deleting unrelated commands',async()=>{
  const calls=[];
  const rest={get:async route=>route.includes('/guilds/')?[{name:'other',type:1,id:'other'}]:[{...keyCommand,type:1,id:'same-id',options:[]}],
    post:async(route,{body})=>calls.push({route,body}),patch:async(route,{body})=>calls.push({route,body})};
  assert.equal(await syncKeyCommands(rest,'app',['guild']),4);
  assert.ok(calls[0].route.endsWith('/same-id'));
  assert.deepEqual(calls.slice(1).map(c=>c.body.name),['key','ban','unban']);
  assert.ok(calls.slice(1).every(c=>!('contexts' in c.body)));
  assert.equal(calls[2].body.default_member_permissions,'4');
});
