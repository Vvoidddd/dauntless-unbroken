import assert from 'node:assert/strict';
import {test} from 'node:test';
import {keyCommand,moderationCommands,syncKeyCommands} from './commands.mjs';
import {counterCommand,syncCounterCommand} from './counter.mjs';
test('unchanged global and guild commands preserve their IDs',async()=>{
  const rest={get:async route=>(route.includes('/guilds/')?moderationCommands:[keyCommand]).map((c,i)=>({...c,id:String(i),type:1})),
    post:async()=>assert.fail('no replacement'),patch:async()=>assert.fail('no patch')};
  assert.equal(await syncKeyCommands(rest,'app',['guild','guild']),0);
});
test('missing guild commands are registered without deleting unrelated commands',async()=>{
  const calls=[];
  const rest={get:async route=>route.includes('/guilds/')?[{name:'other',type:1,id:'other'}]:[{...keyCommand,type:1,id:'same-id',options:[]}],
    post:async(route,{body})=>calls.push({route,body}),patch:async(route,{body})=>calls.push({route,body})};
  assert.equal(await syncKeyCommands(rest,'app',['guild']),3);
  assert.ok(calls[0].route.endsWith('/same-id'));
  assert.deepEqual(calls.slice(1).map(c=>c.body.name),['ban','unban']);
  assert.ok(calls.slice(1).every(c=>!('contexts' in c.body)));
  assert.equal(calls[2].body.default_member_permissions,'4');
});

test('only obsolete guild key/counter copies are deleted; global and moderation IDs survive',async()=>{
 const global=[keyCommand,counterCommand].map((c,i)=>({...c,id:'global'+i,type:1}));
 let guild=[keyCommand,counterCommand,...moderationCommands,{name:'other'}].map((c,i)=>({...c,id:'guild'+i,type:1}));
 const deleted=[];
 const rest={get:async route=>route.includes('/guilds/')?guild:global,
  post:async()=>assert.fail('global commands already exist'),patch:async()=>assert.fail('unchanged'),
  delete:async route=>{deleted.push(route);guild=guild.filter(c=>!route.endsWith('/'+c.id));}};
 assert.equal(await syncKeyCommands(rest,'app',['guild','guild']),1);
 await syncCounterCommand(rest,'app',['guild','guild']);
 assert.deepEqual(deleted.map(r=>r.split('/').at(-1)),['guild0','guild1']);
 assert.deepEqual(guild.map(c=>c.name),['ban','unban','other']);
 assert.equal(await syncKeyCommands(rest,'app',['guild']),0);
 await syncCounterCommand(rest,'app',['guild']);
 assert.equal(deleted.length,2);
});
