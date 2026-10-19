import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkBanPermission,moderationService} from './moderation.mjs';
test('moderation rejects DMs, missing permissions and equal roles before changing anything',async()=>{
 await assert.rejects(checkBanPermission({guild:null},'target',true),/Ban Members/);
 await assert.rejects(checkBanPermission({guild:{},memberPermissions:{has:()=>false}},'target',true),/Ban Members/);
 const i={user:{id:'moderator'},client:{user:{id:'bot'}},memberPermissions:{has:()=>true},guild:{ownerId:'owner',members:{fetchMe:async()=>({permissions:{has:()=>true}}),fetch:async id=>id==='moderator'?{roles:{highest:{comparePositionTo:()=>0}}}:{bannable:true,roles:{highest:{}}}}}};
 await assert.rejects(checkBanPermission(i,'target',true),/equal or higher/);
 for(const target of ['moderator','bot','owner'])await assert.rejects(checkBanPermission(i,target,true),/cannot target/);
});
test('Discord sync is retryable, records failure and ignores obsolete revisions',async()=>{
 const row={discordId:'123456789012345678',revision:1,active:1,reason:'Same visible reason'};
 let fail=true,calls=0,current=row,acks=[];
 const api={access:async()=>({moderation:current}),pendingModeration:async()=>[row],acknowledgeModeration:async body=>{acks.push(body);return {ok:true};}};
 const guild={id:'223456789012345678',members:{ban:async(id,{reason})=>{assert.equal(id,row.discordId);assert.equal(reason,row.reason);calls++;if(fail)throw {code:50013};}}};
 const client={isReady:()=>true,guilds:{cache:new Map([[guild.id,guild]])}};
 const service=moderationService(api);
 await service.poll(client);assert.equal(acks[0].status,'error');
 fail=false;await service.poll(client);assert.equal(acks[1].status,'synced');assert.equal(calls,2);
 current={...row,revision:2,active:0};await service.poll(client);assert.equal(calls,2);assert.equal(acks.length,2);
});
