import {RemoveTestDb} from './setup';
import './authenv';
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {GetDb} from '../src/db';
import {RegisterAccount} from '../src/controllers/accounts';
import {AckDiscordBan,CreateDiscordInvite,DiscordAccess,PendingDiscordBans,SetDiscordBan} from '../src/controllers/discordaccess';
import {ManageAccountAccess} from '../src/controllers/accountaccess';
import {LinkDiscordAccount} from '../src/controllers/discordlinks';
import {BanFor,ModerationLog,RecordPlayingAddress} from '../src/controllers/moderation';
import {HashUserAPIKey,SignMetagameJWTForUid,ValidateMetagameJWTAndGetPayload} from '../src/controllers/auth';
import {app} from '../src/app';
import {CopyLinkedAccountKey} from '../src/controllers/keyrotation';
const db=GetDb().$client;
const guild='1561443722900676679',discord='123456789012345678',other='223456789012345678';
after(()=>RemoveTestDb(()=>db.close()));
test('owned one-use invites link registration atomically and preserve links on failed registration',()=>{
 const old=process.env.ACCOUNT_KEY_RECOVERY;process.env.ACCOUNT_KEY_RECOVERY='1';
 try{
 const {code}=CreateDiscordInvite(discord,undefined);
 assert.equal(CreateDiscordInvite(discord,code).code,code);
 assert.throws(()=>CreateDiscordInvite(other,code),/invite_already_assigned/);
 assert.equal(RegisterAccount('INVITECODE','invalid name',code).ok,false);
 assert.equal(DiscordAccess(discord).account,null);
 const registered=RegisterAccount('INVITECODE','LinkedSlayer',code);
 assert.ok(registered.ok);if(!registered.ok)return;
 assert.equal(DiscordAccess(discord).account?.userId,registered.UserId);
 assert.equal(DiscordAccess(discord).invite?.status,'redeemed');
 assert.equal(RegisterAccount('INVITECODE','Duplicate',code).ok,false);
 assert.equal(LinkDiscordAccount(other,registered.UserId).status,'account_already_linked');
 assert.throws(()=>CreateDiscordInvite(discord,code),/already_linked/);
 assert.equal(CopyLinkedAccountKey(discord).key,registered.UUK);
 }finally{if(old===undefined)delete process.env.ACCOUNT_KEY_RECOVERY;else process.env.ACCOUNT_KEY_RECOVERY=old;}
});
test('Discord bans prevent unused invite redemption and claims, require no game account and track sync revisions',()=>{
 const {code}=CreateDiscordInvite(other,undefined);
 const first=SetDiscordBan({discordId:other,guildId:guild,active:true,reason:'Confirmed harassment'},'discord:moderator');
 assert.equal(first.ban?.reason,'Confirmed harassment');
 assert.equal(RegisterAccount('INVITECODE','BannedNew',code).ok,false);
 assert.throws(()=>CreateDiscordInvite(other,code),/discord_banned/);
 const revision=(first.moderation as any).revision;
 assert.equal(PendingDiscordBans(guild).length,1);
 SetDiscordBan({discordId:other,guildId:guild,active:false,reason:'Appeal accepted'},'owner');
 assert.deepEqual(AckDiscordBan({discordId:other,guildId:guild,revision,status:'synced'}),{ok:false});
 assert.equal((DiscordAccess(other).moderation as any).syncStatus,'pending');
 assert.equal(AckDiscordBan({discordId:other,guildId:guild,revision:revision+1,status:'synced'}).ok,true);
 assert.equal(PendingDiscordBans(guild).length,0);
 assert.equal(RegisterAccount('INVITECODE','UnbannedNew',code).ok,true);
});
test('linked game bans use the same reason, default account-only, audit moderator and cannot restrict administrators',()=>{
 const account=DiscordAccess(discord).account!.userId;
 const token=SignMetagameJWTForUid(account);
 SetDiscordBan({discordId:discord,guildId:guild,active:true,reason:'Verified evidence'},'discord:moderator');
 assert.equal(BanFor(account)?.reason,'Verified evidence');
 assert.equal(BanFor('UID-unrelated','203.0.113.77'),undefined);
 assert.throws(()=>ValidateMetagameJWTAndGetPayload(token),/account_banned/);
 assert.ok(ModerationLog('events').rows.some((r:any)=>r.account_id===account&&r.reason==='Verified evidence'&&r.actor==='discord:moderator'));
 SetDiscordBan({discordId:discord,guildId:guild,active:false,reason:'Reviewed'},'owner');
 assert.ok(ValidateMetagameJWTAndGetPayload(token));
 assert.throws(()=>SetDiscordBan({discordId:discord,guildId:guild,active:true,reason:'x',includeIp:true},'owner'),/address_not_observed/);
 RecordPlayingAddress({headers:{},socket:{remoteAddress:'203.0.113.77'}} as any,account);
 SetDiscordBan({discordId:discord,guildId:guild,active:true,reason:'IP evidence',includeIp:true},'owner');
 assert.equal(BanFor('UID-unrelated','203.0.113.77')?.reason,'IP evidence');
 SetDiscordBan({discordId:discord,guildId:guild,active:false,reason:'Reviewed'},'owner');
 db.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES(?,?,0,1)').run('UID-protected','Protected');
 LinkDiscordAccount('323456789012345678','UID-protected');
 assert.throws(()=>SetDiscordBan({discordId:'323456789012345678',guildId:guild,active:true,reason:'x'},'owner'),/admin_account_protected/);
 assert.equal(DiscordAccess('323456789012345678').moderation,null);
});
test('manual access changes revoke credentials and sessions without deleting player data or leaking keys into audit',()=>{
 const account=DiscordAccess(discord).account!.userId;
 const token=SignMetagameJWTForUid(account);
 const rotated=ManageAccountAccess({action:'rotate-key',accountId:account,reason:'Verified ownership'},'owner');
 assert.ok(rotated.key?.startsWith('UUK_'));
 assert.equal((db.prepare('SELECT keyHash FROM userapikeys WHERE userId=?').get(account) as any).keyHash,HashUserAPIKey(rotated.key!));
 assert.throws(()=>ValidateMetagameJWTAndGetPayload(token),/session_revoked/);
 assert.ok(!JSON.stringify(db.prepare('SELECT * FROM account_access_events').all()).includes(rotated.key!));
 ManageAccountAccess({action:'revoke-key',accountId:account,reason:'Key exposed'},'owner');
 assert.equal(db.prepare('SELECT 1 FROM userapikeys WHERE userId=?').get(account),undefined);
 assert.ok(db.prepare('SELECT 1 FROM users WHERE userId=?').get(account));
 ManageAccountAccess({action:'unlink-discord',accountId:account,reason:'Owner request'},'owner');
 assert.equal(DiscordAccess(discord).account,null);
 ManageAccountAccess({action:'link-discord',accountId:account,discordId:discord,reason:'Ownership verified'},'owner');
 assert.equal(DiscordAccess(discord).account?.userId,account);
 assert.throws(()=>ManageAccountAccess({action:'revoke-key',accountId:'UID-protected',reason:'x'},'owner'),/protected/);
 const unclaimed='423456789012345678';const {code}=CreateDiscordInvite(unclaimed,undefined);
 ManageAccountAccess({action:'revoke-invite',discordId:unclaimed,reason:'Invite exposed'},'owner');
 assert.equal(DiscordAccess(unclaimed).invite?.status,'revoked');
 assert.throws(()=>CreateDiscordInvite(unclaimed,code),/invite_not_unused/);
});
test('operator endpoints refuse players, proxies and missing auth; banned and revoked tokens fail OAuth verification',async()=>{
 const user='UID-api-access',admin='UID-api-owner',key='UUK_'+'1'.repeat(48),owner='UUK_'+'2'.repeat(48);
 db.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES(?,?,0,0)').run(user,'ApiAccess');
 db.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES(?,?,0,1)').run(admin,'ApiOwner');
 db.prepare('INSERT INTO userapikeys VALUES(?,?)').run(user,HashUserAPIKey(key));db.prepare('INSERT INTO userapikeys VALUES(?,?)').run(admin,HashUserAPIKey(owner));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const port=(server.address() as any).port;
 const request=(path:string,apiKey?:string,body?:any,extra={})=>fetch(`http://127.0.0.1:${port}${path}`,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(apiKey?{'x-dauntless-unbroken-user-api-key':apiKey}:{}),...extra},body:body?JSON.stringify(body):undefined});
 try{
  for(const [path,body] of [['/DiscordAccess/'+discord,undefined],['/DiscordInvite',{discordId:'523456789012345678'}],['/DiscordModeration',{discordId:discord,guildId:guild,active:true,reason:'x'}],['/AccountAccess',{action:'revoke-key',accountId:user,reason:'x'}],['/DiscordModerationAck',{discordId:discord,guildId:guild,revision:1,status:'synced'}],['/AccountAccessLog',undefined],['/DiscordModerationPending?guildId='+guild,undefined]] as [string,any][]){
   assert.equal((await request('/unbroken/api'+path,undefined,body)).status,401);
   assert.equal((await request('/unbroken/api'+path,key,body)).status,403);
   assert.equal((await request('/unbroken/api'+path,owner,body,{'x-forwarded-for':'203.0.113.1'})).status,403);
  }
  LinkDiscordAccount('623456789012345678',user);const token=SignMetagameJWTForUid(user);
  SetDiscordBan({discordId:'623456789012345678',guildId:guild,active:true,reason:'Shown everywhere'},'owner');
  const refused=await request('/account/api/oauth/verify',undefined,undefined,{authorization:'Bearer '+token});
  assert.equal(refused.status,403);assert.deepEqual(await refused.json(),{error:'account_banned',reason:'Shown everywhere'});
  assert.equal((await (await request('/unbroken/api/GetUserInfo',key)).json()).reason,'Shown everywhere');
  SetDiscordBan({discordId:'623456789012345678',guildId:guild,active:false,reason:'Appeal'},'owner');
  ManageAccountAccess({action:'revoke-key',accountId:user,reason:'Key exposed'},'owner');
  assert.equal((await request('/account/api/oauth/verify',undefined,undefined,{authorization:'Bearer '+token})).status,401);
 }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
});
