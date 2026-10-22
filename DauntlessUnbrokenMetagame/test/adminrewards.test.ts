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
import catalog from '../src/vendor/admin_grant_catalog.json';
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
  const item=RewardCatalog('',category).items.find(i=>i.unique&&i.grantable)!;
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
 const all=[...RewardCatalog('','Weapons').items,...RewardCatalog('','Weapon parts').items].filter(i=>i.grantable);
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

const bulkRequest=(a:{UserId:string,CharacterId:string},bundle:string)=>({accountId:a.UserId,characterId:a.CharacterId,bundle,reason:'Bulk event reward',requestId:randomUUID()});

test('cosmetics bulk grants the full catalogue once, preserves balances, and records one atomic audit',async()=>{
 const a=await MakePlayer(),db=GetDb(),expected=catalog.items.filter(i=>i.grantable&&['Transmogs','Dyes','Other cosmetics'].includes(i.category));
 GrantReward('UID-owner',request(a,expected[0].id,1));GrantReward('UID-owner',request(a,'CURRENCY_NOTES',123));
 const countTransactions=()=>db.select().from(inventorytransactions).where(eq(inventorytransactions.characterId,a.CharacterId)).all().length;
 const previousTransactions=countTransactions(),body=bulkRequest(a,'cosmetics'),result=GrantReward('UID-owner',body);
 assert.ok(expected.length>100);assert.equal(result.total,expected.length);assert.equal(result.added,expected.length-1);assert.equal(result.skipped,1);
 assert.equal(countTransactions(),previousTransactions+1);assert.equal(RewardAccount(a.UserId).history.length,3);
 const row=db.select().from(inventory).where(eq(inventory.characterId,a.CharacterId)).get()!;
 const all=[...JSON.parse(row.stackedItems),...JSON.parse(row.instancedItems)];
 for(const item of expected){const owned=all.filter(i=>i.catalogId===item.id);assert.equal(owned.length,1,item.id);if(item.kind==='stacked')assert.equal(owned[0].quantity,1);}
 assert.equal(StackQuantity(a.CharacterId,'CURRENCY_NOTES'),123);
 const weapons=new Set(catalog.items.filter(i=>typeof i.maxRank==='number').map(i=>i.id));assert.ok(!all.some(i=>weapons.has(i.catalogId)));
 db.delete(inventorytransactions).where(eq(inventorytransactions.userId,a.UserId)).run();
 assert.deepEqual(GrantReward('UID-owner',body),{...result,replayed:true});
 const repeat=GrantReward('UID-owner',bulkRequest(a,'cosmetics'));assert.equal(repeat.added,0);assert.equal(repeat.skipped,expected.length);
 assert.deepEqual(db.select().from(inventory).where(eq(inventory.characterId,a.CharacterId)).get(),row);
 for(const modified of [{...body,bundle:'weapons'},{...body,reason:'different'}])assert.throws(()=>GrantReward('UID-owner',modified),/already used/);
 const bundles=RewardCatalog('does not match anything').bundles;
 assert.equal(bundles.find(b=>b.id==='cosmetics')!.total,expected.length);
 assert.equal(bundles.find(b=>b.id==='flares')!.total,expected.filter(i=>i.id.startsWith('QI_FLARE_')||i.id==='QI_BASIC_FLARE_DURABLE').length);
});

test('max weapons bulk respects every rank cap and preserves owned weapon identity, cells and customizations',async()=>{
 const a=await MakePlayer(),db=GetDb(),id='WP_EB_LERAWR',expected=catalog.items.filter(i=>i.grantable&&['Weapons','Weapon parts'].includes(i.category)&&typeof i.maxRank==='number');
 GrantReward('UID-owner',{...request(a,id,1),rank:3});
 const read=()=>db.select().from(inventory).where(eq(inventory.characterId,a.CharacterId)).get()!;
 const original=JSON.parse(read().instancedItems)[0],data={...JSON.parse(original.itemData),EquippedCells:[{CellID:'CELL_CRIT_CHANCE_E'}],TransmogCatalogID:'CUSTOM_SKIN',CurrentXP:123};
 db.update(inventory).set({instancedItems:JSON.stringify([{...original,updateVersion:7,itemData:JSON.stringify(data)}])}).where(eq(inventory.characterId,a.CharacterId)).run();
 const result=GrantReward('UID-owner',bulkRequest(a,'weapons')),saved=read(),owned=JSON.parse(saved.instancedItems);
 assert.equal(result.total,expected.length);assert.equal(result.added,expected.length-1);assert.equal(result.upgradedCount,1);assert.equal(result.skipped,0);
 assert.equal(owned.length,expected.length);
 for(const item of expected)assert.equal(JSON.parse(owned.find((i:any)=>i.catalogId===item.id).itemData).CurrentLevel,item.maxRank,item.id);
 const sword=owned.find((i:any)=>i.catalogId===id);assert.equal(sword.instanceId,original.instanceId);assert.equal(sword.updateVersion,8);assert.deepEqual(JSON.parse(sword.itemData),{...data,CurrentLevel:15});
 const repeat=GrantReward('UID-owner',bulkRequest(a,'weapons'));assert.equal(repeat.added,0);assert.equal(repeat.upgradedCount,0);assert.equal(repeat.skipped,expected.length);assert.deepEqual(read(),saved);
});

test('bulk grants reject forged fields and roll back inventory and permanent receipts when the final audit write fails',async()=>{
 const a=await MakePlayer(),b=await MakePlayer(),db=GetDb(),body=bulkRequest(a,'flares');
 for(const extra of [{bundle:'dev-items'},{bundle:null},{catalogId:'CURRENCY_NOTES'},{quantity:1},{rank:15},{items:['DEV']},{characterId:b.CharacterId}])assert.throws(()=>GrantReward('UID-owner',{...body,...extra}));
 GrantReward('UID-owner',request(a,'CURRENCY_NOTES',5));
 const read=()=>db.select().from(inventory).where(eq(inventory.characterId,a.CharacterId)).get(),original=read();
 db.$client.exec(`CREATE TEMP TRIGGER fail_bulk_audit BEFORE INSERT ON progression_events WHEN NEW.route = 'admin AccountGrant:${body.requestId}' BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END`);
 try{assert.throws(()=>GrantReward('UID-owner',body),/simulated audit failure/);assert.deepEqual(read(),original);assert.equal(RewardAccount(a.UserId).history.length,1);}
 finally{db.$client.exec('DROP TRIGGER fail_bulk_audit');}
 assert.ok(GrantReward('UID-owner',body).added>0);assert.equal(RewardAccount(a.UserId).history.length,2);
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
 const bundle=bulkRequest(a,'flares');
 assert.equal((await Call('POST','/unbroken/api/RewardGrant',{as:a.UserId,body:bundle})).status,401);
 assert.equal((await Call('POST','/unbroken/api/RewardGrant',{headers:{'x-dauntless-unbroken-user-api-key':playerKey},body:bundle})).status,403);
 assert.equal((await Call('POST','/unbroken/api/RewardGrant',{headers:{...headers,'x-dauntless-gateway':'1'},body:bundle})).status,403);
 assert.equal((await Call('POST','/unbroken/api/RewardGrant',{headers,body:bundle})).status,200);
 assert.equal(RewardAccount(a.UserId).history[0].actor,admin.UserId);
 assert.equal(RewardCatalog('Rams').items[0].id,'CURRENCY_NOTES');
 assert.ok(RewardCatalog('','Cells').items.every(i=>i.kind==='stacked'));
 assert.ok(RewardCatalog('PLACEHOLDER').items.every(i=>!i.grantable));
});

test('complete catalogue resolves in-game names, ranks exact matches first and exposes every item through paging',()=>{
 const dark=RewardCatalog('dark watch').items[0];assert.equal(dark.id,'AR_CROWBEAR_HELM');assert.equal(dark.category,'Armour');assert.equal(dark.maxRank,15);assert.equal(dark.grantable,true);
 for(const query of ['Dark-Watch','darkwatch','WATCH DARK','AR_CROWBEAR_HELM'])assert.ok(RewardCatalog(query).items.some(i=>i.id===dark.id));
 const mask=RewardCatalog('Shady Shrowd Mask').items[0];assert.equal(mask.id,'AR_DHMASK_CROWBEAR_HELM');assert.equal(mask.category,'Transmogs');
 assert.ok(RewardCatalog('Blitz Tonic','Consumables').items.some(i=>i.grantable));
 assert.ok(RewardCatalog('Dark Tailfeather','Materials').items.some(i=>i.grantable));
 const ids=new Set<string>();for(let offset=0;offset<catalog.items.length;offset+=100){const page=RewardCatalog('','',offset);assert.equal(page.offset,offset);assert.equal(page.hasMore,offset+100<catalog.items.length);for(const item of page.items){assert.ok(!ids.has(item.id));ids.add(item.id);}}
 assert.equal(ids.size,catalog.items.length);assert.ok(ids.size>5000);
 for(const offset of [-1,1.5,NaN,'-1','1e3','',100001])assert.throws(()=>RewardCatalog('','',offset),/offset/);
});

test('armour grants use real equipment caps and unavailable catalogue entries cannot be granted or included in bulk',async()=>{
 const a=await MakePlayer(),db=GetDb(),id='AR_CROWBEAR_HELM';
 assert.equal(GrantReward('UID-owner',{...request(a,id,1),rank:5}).rankAfter,5);
 const saved=()=>JSON.parse(db.select().from(inventory).where(eq(inventory.characterId,a.CharacterId)).get()!.instancedItems);
 const original=saved()[0];assert.equal(GrantReward('UID-owner',{...request(a,id,1),rank:15}).upgraded,true);assert.equal(saved()[0].instanceId,original.instanceId);assert.equal(saved().length,1);
 const excluded=RewardCatalog('AR_DEBUG_HELM_MANYCELLS').items.find(i=>i.id==='AR_DEBUG_HELM_MANYCELLS')!;assert.equal(excluded.grantable,false);assert.ok(excluded.unavailableReason);
 assert.throws(()=>GrantReward('UID-owner',{...request(a,excluded.id,1),rank:0}),/Restricted|Developer/);
 assert.throws(()=>GrantReward('UID-owner',{...request(a,id,1),rank:16}),/rank/);
 const bulk=GrantReward('UID-owner',bulkRequest(a,'weapons'));assert.equal(bulk.total,catalog.items.filter(i=>i.grantable&&['Weapons','Weapon parts'].includes(i.category)&&typeof i.maxRank==='number').length);
 assert.equal(saved().filter((i:any)=>i.catalogId.startsWith('AR_')).length,1);
});
