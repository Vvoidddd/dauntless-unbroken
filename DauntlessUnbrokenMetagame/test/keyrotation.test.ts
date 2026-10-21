import {RemoveTestDb} from './setup';
import './authenv';
import './appenv';
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {GetDb} from '../src/db';
import {MakePlayer} from './helpers';
import {HashUserAPIKey,GetUserIDForAPIKey,SignMetagameJWTForUid,ValidateMetagameJWTAndGetPayload} from '../src/controllers/auth';
import {BeginKeyRecovery,CompleteKeyRecovery,ProveRecoveryLink,CopyLinkedAccountKey} from '../src/controllers/keyrotation';
import {SetAccountBan} from '../src/controllers/moderation';
import {LinkDiscordAccount} from '../src/controllers/discordlinks';
import {StartApp,StopApp,Call} from './appclient';
after(()=>RemoveTestDb(()=>GetDb().$client.close()));
let counter=0;
async function fixture(){
 const p=await MakePlayer();const id=String(100000000000000000n+BigInt(++counter));
 const key='UUK_'+crypto.randomUUID().replace(/-/g,'');
 GetDb().$client.prepare('INSERT INTO userapikeys VALUES(?,?)').run(p.UserId,HashUserAPIKey(key));
 return {...p,id,key};
}

test('verified key copies preserve the PC key, JWT and account; unverified or banned links cannot copy',async()=>{
 const old=process.env.ACCOUNT_KEY_RECOVERY;process.env.ACCOUNT_KEY_RECOVERY='1';
 try {
  const p=await fixture(),other=await fixture();const jwt=SignMetagameJWTForUid(p.UserId);
  LinkDiscordAccount(p.id,p.UserId);
  assert.equal(CopyLinkedAccountKey(p.id).status,'unverified');
  assert.equal(ProveRecoveryLink(p.id,p.key),true);
  for(let i=0;i<2;i++)assert.equal(CopyLinkedAccountKey(p.id).key,p.key);
  assert.equal(await GetUserIDForAPIKey(p.key),p.UserId);
  assert.doesNotThrow(()=>ValidateMetagameJWTAndGetPayload(jwt));
  assert.equal(CopyLinkedAccountKey(other.id).key,undefined);
  const saved=GetDb().$client.prepare('SELECT ciphertext FROM accountkeyrecovery WHERE userId=?').get(p.UserId) as {ciphertext:string};
  assert.ok(saved.ciphertext&&!saved.ciphertext.includes(p.key));
  SetAccountBan(p.UserId,'test restriction',true,null,'test');
  assert.equal(CopyLinkedAccountKey(p.id).key,undefined);
 }finally{if(old===undefined)delete process.env.ACCOUNT_KEY_RECOVERY;else process.env.ACCOUNT_KEY_RECOVERY=old;}
});

test('copy rate limit, unlink and key rotation fail closed',async()=>{
 const old=process.env.ACCOUNT_KEY_RECOVERY;process.env.ACCOUNT_KEY_RECOVERY='1';
 try {
  const p=await fixture();ProveRecoveryLink(p.id,p.key);
  for(let i=0;i<4;i++)assert.equal(CopyLinkedAccountKey(p.id).key,p.key);
  assert.equal(CopyLinkedAccountKey(p.id).status,'cooldown');
  const unlinked=await fixture();ProveRecoveryLink(unlinked.id,unlinked.key);
  GetDb().$client.prepare('DELETE FROM discordlinks WHERE discordId=?').run(unlinked.id);
  assert.equal(CopyLinkedAccountKey(unlinked.id).key,undefined);
  const rotated=await fixture();ProveRecoveryLink(rotated.id,rotated.key);
  const replacement=CompleteKeyRecovery(rotated.id,BeginKeyRecovery(rotated.id)!);
  assert.ok(replacement);assert.equal(CopyLinkedAccountKey(rotated.id).key,undefined);
 }finally{if(old===undefined)delete process.env.ACCOUNT_KEY_RECOVERY;else process.env.ACCOUNT_KEY_RECOVERY=old;}
});
test('verified recovery rotates atomically, revokes old key and JWT, and refuses replay',async()=>{
 const p=await fixture();const jwt=SignMetagameJWTForUid(p.UserId);
 assert.equal(ProveRecoveryLink(p.id,p.key),true);
 const challenge=BeginKeyRecovery(p.id)!;
 const key=CompleteKeyRecovery(p.id,challenge)!;
 assert.match(key,/^UUK_[a-f0-9]{64}$/);
 assert.equal(await GetUserIDForAPIKey(p.key),undefined);
 assert.equal(await GetUserIDForAPIKey(key),p.UserId);
 assert.throws(()=>ValidateMetagameJWTAndGetPayload(jwt),/session_revoked/);
 assert.equal(CompleteKeyRecovery(p.id,challenge),null);
 assert.doesNotThrow(()=>ValidateMetagameJWTAndGetPayload(SignMetagameJWTForUid(p.UserId)));
});
test('administrator-created link alone and wrong key do not prove ownership',async()=>{
 const p=await fixture();LinkDiscordAccount(p.id,p.UserId);
 assert.equal(ProveRecoveryLink(p.id,'wrong'),false);
 assert.equal(CompleteKeyRecovery(p.id,BeginKeyRecovery(p.id)!),null);
 assert.equal(await GetUserIDForAPIKey(p.key),p.UserId);
});
test('another Discord actor cannot redeem a challenge',async()=>{
 const p=await fixture(),other=await fixture();ProveRecoveryLink(p.id,p.key);
 const challenge=BeginKeyRecovery(p.id)!;
 assert.equal(CompleteKeyRecovery(other.id,challenge),null);
 assert.ok(CompleteKeyRecovery(p.id,challenge));
});
test('expired challenge and excessive attempts refuse without revoking the key',async()=>{
 const p=await fixture();const now=Date.now();ProveRecoveryLink(p.id,p.key,now);
 const challenge=BeginKeyRecovery(p.id,now)!;
 assert.equal(CompleteKeyRecovery(p.id,challenge,now+300001),null);
 for(let i=0;i<6;i++)BeginKeyRecovery(p.id,now+300002);
 assert.equal(BeginKeyRecovery(p.id,now+300003),null);
 assert.equal(await GetUserIDForAPIKey(p.key),p.UserId);
});
test('a database failure rolls back key rotation and leaves the challenge usable',async()=>{
 const p=await fixture();ProveRecoveryLink(p.id,p.key);const challenge=BeginKeyRecovery(p.id)!;
 const db=GetDb().$client;
 db.exec("CREATE TRIGGER fail_epoch BEFORE INSERT ON authepochs BEGIN SELECT RAISE(ABORT,'test failure'); END");
 try{assert.throws(()=>CompleteKeyRecovery(p.id,challenge));assert.equal(await GetUserIDForAPIKey(p.key),p.UserId);}
 finally{db.exec('DROP TRIGGER fail_epoch');}
 assert.ok(CompleteKeyRecovery(p.id,challenge));
});
test('recovery endpoint refuses ordinary players, admin headers and proxied service requests',async()=>{
 await StartApp();process.env.KEY_RECOVERY_SERVICE_SECRET=crypto.randomUUID()+crypto.randomUUID();
 try{
  const p=await fixture();
  assert.equal((await Call('POST','/internal/key-recovery/begin',{as:p.UserId,body:{discordId:p.id}})).status,403);
  assert.equal((await Call('POST','/internal/key-recovery/begin',{gs:true,body:{discordId:p.id}})).status,403);
  assert.equal((await Call('POST','/internal/key-recovery/begin',{headers:{'x-key-recovery-service':process.env.KEY_RECOVERY_SERVICE_SECRET,'x-forwarded-for':'192.0.2.1'},body:{discordId:p.id}})).status,403);
  const result=await Call('POST','/internal/key-recovery/begin',{headers:{'x-key-recovery-service':process.env.KEY_RECOVERY_SERVICE_SECRET},body:{discordId:p.id}});
  assert.equal(result.status,200);assert.match(result.json.challenge,/^[a-f0-9]{64}$/);
 }finally{delete process.env.KEY_RECOVERY_SERVICE_SECRET;await StopApp();}
});

test('copy endpoint requires dedicated local authentication and never accepts another userId',async()=>{
 const old=process.env.ACCOUNT_KEY_RECOVERY;process.env.ACCOUNT_KEY_RECOVERY='1';
 await StartApp();process.env.KEY_RECOVERY_SERVICE_SECRET=crypto.randomUUID()+crypto.randomUUID();
 try{
  const p=await fixture(),other=await fixture();ProveRecoveryLink(p.id,p.key);
  const endpoint='/internal/key-recovery/copy',body={discordId:p.id,userId:other.UserId};
  for(const options of [{as:p.UserId},{gs:true},{headers:{'x-key-recovery-service':process.env.KEY_RECOVERY_SERVICE_SECRET,'x-forwarded-for':'192.0.2.1'}}]){
   const refused=await Call('POST',endpoint,{...options,body});
   assert.equal(refused.status,403);assert.ok(!JSON.stringify(refused.json).includes(p.key));
  }
  const copy=await Call('POST',endpoint,{headers:{'x-key-recovery-service':process.env.KEY_RECOVERY_SERVICE_SECRET},body});
  assert.equal(copy.status,200);assert.equal(copy.json.key,p.key);
  assert.equal(await GetUserIDForAPIKey(p.key),p.UserId);
 }finally{delete process.env.KEY_RECOVERY_SERVICE_SECRET;if(old===undefined)delete process.env.ACCOUNT_KEY_RECOVERY;else process.env.ACCOUNT_KEY_RECOVERY=old;await StopApp();}
});
