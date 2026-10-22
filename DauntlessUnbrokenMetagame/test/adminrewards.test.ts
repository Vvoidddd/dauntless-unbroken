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

test('weapon grants preserve identity and customizations, upgrade in place and never duplicate or downgrade',async()=>{
 const a=await MakePlayer(),id='WP_EB_LERAWR',db=GetDb();
 const read=()=>JSON.parse(db.select().from(inventory).where(eq(inventory.characterId,a.CharacterId)).get()!.instancedItems);
 const body={...request(a,id,1),rank:3};
 assert.equal(GrantReward('UID-owner',body).rankAfter,3);
 const original=read()[0],data={...JSON.parse(original.itemData),EquippedCells:[{CellID:'CELL_CRIT_CHANCE_E'}],EquippedWeaponParts:[{ItemID:'PART_EB_SPECIAL_DEFAULT'}],TransmogCatalogID:'CUSTOM_SKIN',CurrentXP:123,customField:true};
 db.update(inventory).set({instancedItems:JSON.stringify([{...original,updateVersion:7,itemData:JSON.stringify(data)}])}).where(eq(inventory.characterId,a.CharacterId)).run();
 const upgrade={...request(a,id,1),rank:15},result=GrantReward('UID-owner',upgrade),saved=read();
 assert.equal(result.added,0);assert.equal(result.upgraded,true);assert.equal(result.rankBefore,3);assert.equal(result.rankAfter,15);
 assert.equal(saved.length,1);assert.equal(saved[0].instanceId,original.instanceId);assert.equal(saved[0].updateVersion,8);
 assert.deepEqual(JSON.parse(saved[0].itemData),{...data,CurrentLevel:15});
 assert.deepEqual(GrantReward('UID-owner',upgrade),{...result,replayed:true});
 assert.throws(()=>GrantReward('UID-owner',{...upgrade,rank:14}),/already used/);
 const lower=GrantReward('UID-owner',{...request(a,id,1),rank:2});assert.equal(lower.rankAfter,15);assert.equal(lower.upgraded,false);
 assert.deepEqual(read(),saved);assert.equal(RewardAccount(a.UserId).history[1].rankAfter,15);
});

test('weapon catalogue exposes real rank caps and rejects invalid ranks, non-weapons and corrupt existing data',async()=>{
 const a=await MakePlayer(),id='WP_EB_LERAWR',base=request(a,id,1),db=GetDb();
 assert.equal(RewardCatalog(id,'Weapons').items.find(i=>i.id===id)!.maxRank,15);
 assert.equal(RewardCatalog('WP_EB_BEGINNER','Weapons').items[0].maxRank,0);
 const all=[...RewardCatalog('','Weapons').items,...RewardCatalog('','Weapon parts').items];
 assert.ok(all.length>100);assert.ok(all.every(i=>i.unique&&i.kind==='instanced'&&!/TEST|DEBUG|TRAINING|DUMMY/.test(i.id)));
 for(const rank of [undefined,null,'15',NaN,-1,1.5,16,999])assert.throws(()=>GrantReward('UID-owner',{...base,rank}),/rank/);
 assert.throws(()=>GrantReward('UID-owner',{...request(a,'WP_EB_BEGINNER',1),rank:15}),/rank/);
 assert.throws(()=>GrantReward('UID-owner',{...request(a),rank:15}),/Rank applies/);
 assert.throws(()=>GrantReward('UID-owner',{...base,rank:15,quantity:2}),/Quantity/);
 assert.equal(RewardAccount(a.UserId).history.length,0);
 GrantReward('UID-owner',{...base,rank:0});
 const row=db.select().from(inventory).where(eq(inventory.characterId,a.CharacterId)).get()!,original=JSON.parse(row.instancedItems)[0];
 for(const entries of [[{...original,itemData:'bad-json'}],[original,{...original,instanceId:'duplicate'}]]){
  const encoded=JSON.stringify(entries);db.update(inventory).set({instancedItems:encoded}).where(eq(inventory.characterId,a.CharacterId)).run();
  assert.throws(()=>GrantReward('UID-owner',{...request(a,id,1),rank:15}),/repair/);
  assert.equal(db.select().from(inventory).where(eq(inventory.characterId,a.CharacterId)).get()!.instancedItems,encoded);
 }
 assert.equal(RewardAccount(a.UserId).history.length,1);
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
