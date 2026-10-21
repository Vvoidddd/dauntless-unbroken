import {RemoveTestDb} from './setup';
import './authenv';
import './appenv';
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {eq} from 'drizzle-orm';
import {GetDb} from '../src/db';
import {inventory,inventorytransactions,userapikeys,users} from '../src/db/schema';
import {HashUserAPIKey} from '../src/controllers/auth';
import {GrantReward,RewardAccount,RewardCatalog} from '../src/controllers/adminrewards';
import {MakePlayer,StackQuantity} from './helpers';
import {StartApp,StopApp,Call} from './appclient';
before(StartApp);
after(async()=>{await StopApp();RemoveTestDb(()=>GetDb().$client.close());});
const request=(a:{UserId:string,CharacterId:string},id='CURRENCY_NOTES',quantity=10000)=>({accountId:a.UserId,characterId:a.CharacterId,catalogId:id,quantity,reason:'Verified event reward',requestId:randomUUID()});

test('currency, bounty tokens and cells use inventory authority and append an actor/reason audit',async()=>{
 const a=await MakePlayer();
 for(const [id,quantity] of [['CURRENCY_NOTES',5000000],['TOKEN_BOUNTY_DRAFT_PREMIUM',5000],['CELL_CRIT_CHANCE_E',3]] as const){
  const result=GrantReward('UID-owner',request(a,id,quantity));
  assert.equal(result.added,quantity);assert.equal(StackQuantity(a.CharacterId,id),quantity);
 }
 const info=RewardAccount(a.UserId);
 assert.equal(info.history.length,3);assert.equal(info.history[0].actor,'UID-owner');assert.equal(info.history[0].reason,'Verified event reward');
 assert.equal(info.characters[0].id,a.CharacterId);assert.ok(!JSON.stringify(info).includes('keyHash'));
});

test('retries remain once-only after inventory receipt pruning and reject changed payloads or targets',async()=>{
 const a=await MakePlayer(),b=await MakePlayer(),body=request(a);
 const first=GrantReward('UID-owner',body);
 GetDb().delete(inventorytransactions).where(eq(inventorytransactions.userId,a.UserId)).run();
 assert.deepEqual(GrantReward('UID-owner',body),{...first,replayed:true});
 assert.equal(StackQuantity(a.CharacterId,'CURRENCY_NOTES'),10000);
 for(const modified of [{...body,quantity:2},{...body,reason:'different'},{...body,accountId:b.UserId,characterId:b.CharacterId}])assert.throws(()=>GrantReward('UID-owner',modified),/already used/);
 assert.throws(()=>GrantReward('UID-other-admin',body),/already used/);
 assert.equal(RewardAccount(a.UserId).history.length,1);
});

test('independent backend processes serialize duplicate grant attempts',async()=>{
 const a=await MakePlayer(),body=request(a);
 const code=`const {GrantReward}=require(${JSON.stringify(require.resolve('../src/controllers/adminrewards'))});console.log(JSON.stringify(GrantReward('UID-owner',${JSON.stringify(body)})));`;
 const run=()=>new Promise<any>((resolve,reject)=>{
  const child=spawn(process.execPath,['-e',code],{env:process.env,timeout:15000});let out='';child.stdout.on('data',v=>out+=v);child.on('error',reject);child.on('exit',n=>n===0?resolve(JSON.parse(out.trim())):reject(Error('Grant worker failed')));
 });
 const results=await Promise.all([run(),run()]);assert.equal(results.filter(r=>r.replayed).length,1);assert.equal(StackQuantity(a.CharacterId,'CURRENCY_NOTES'),10000);
});

test('stacked and instanced cosmetics skip existing unlocks under new request IDs',async()=>{
 const a=await MakePlayer();
 for(const category of ['Transmogs','Dyes','Other cosmetics']){
  const item=RewardCatalog('',category).items.find(i=>i.unique)!;
  assert.equal(GrantReward('UID-owner',request(a,item.id,1)).added,1);
  assert.equal(GrantReward('UID-owner',request(a,item.id,1)).added,0);
 }
 assert.equal(RewardAccount(a.UserId).history.length,6);
});

test('invalid grants and overflow cannot mutate inventory or consume a receipt',async()=>{
 const a=await MakePlayer(),b=await MakePlayer(),base=request(a);
 for(const quantity of [-1,0,1.5,NaN,10000001,'100'])assert.throws(()=>GrantReward('UID-owner',{...base,quantity}));
 for(const body of [{...base,catalogId:'NOT_REAL'},{...base,characterId:b.CharacterId},{...base,reason:''},{...base,reason:'bad\nreason'},{...base,actorId:'spoofed'},{...base,requestId:'invalid'}])assert.throws(()=>GrantReward('UID-owner',body));
 assert.equal(StackQuantity(a.CharacterId,'CURRENCY_NOTES'),0);assert.equal(RewardAccount(a.UserId).history.length,0);
 GetDb().insert(inventory).values({characterId:a.CharacterId,instancedItems:'[]',stackedItems:JSON.stringify([{catalogId:'CURRENCY_NOTES',quantity:2147483640}])}).run();
 assert.throws(()=>GrantReward('UID-owner',base),/exceed/);
 assert.equal(StackQuantity(a.CharacterId,'CURRENCY_NOTES'),2147483640);
 GetDb().update(inventory).set({stackedItems:'[]'}).where(eq(inventory.characterId,a.CharacterId)).run();
 assert.equal(GrantReward('UID-owner',base).added,10000);
});

test('reward APIs require a direct admin key; actors come from authentication',async()=>{
 const a=await MakePlayer(),admin=await MakePlayer(),key='UUK_'+randomUUID(),playerKey='UUK_'+randomUUID();
 GetDb().update(users).set({isAdmin:true}).where(eq(users.userId,admin.UserId)).run();
 GetDb().insert(userapikeys).values([{userId:admin.UserId,keyHash:HashUserAPIKey(key)},{userId:a.UserId,keyHash:HashUserAPIKey(playerKey)}]).run();
 const headers={'x-dauntless-unbroken-user-api-key':key};
 for(const route of ['/RewardCatalog?q=Rams','/RewardAccount?accountId='+a.UserId]){
  assert.equal((await Call('GET','/unbroken/api'+route)).status,401);
  assert.equal((await Call('GET','/unbroken/api'+route,{headers:{'x-dauntless-unbroken-user-api-key':playerKey}})).status,403);
  assert.equal((await Call('GET','/unbroken/api'+route,{headers:{...headers,'x-dauntless-gateway':'1'}})).status,403);
  assert.equal((await Call('GET','/unbroken/api'+route,{headers})).status,200);
 }
 const body=request(a);
 assert.equal((await Call('POST','/unbroken/api/RewardGrant',{as:a.UserId,body})).status,401);
 assert.equal((await Call('POST','/unbroken/api/RewardGrant',{headers:{'x-dauntless-unbroken-user-api-key':playerKey},body})).status,403);
 assert.equal((await Call('POST','/unbroken/api/RewardGrant',{headers,body})).status,200);
 assert.equal(RewardAccount(a.UserId).history[0].actor,admin.UserId);
 assert.equal(RewardCatalog('Rams').items[0].id,'CURRENCY_NOTES');
 assert.ok(RewardCatalog('','Cells').items.every(i=>i.kind==='stacked'));
 assert.equal(RewardCatalog('PLACEHOLDER').total,0);
});
