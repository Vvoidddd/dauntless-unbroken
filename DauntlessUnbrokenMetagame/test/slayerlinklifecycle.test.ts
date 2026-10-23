import {RemoveTestDb} from './setup';
import './authenv';
import {after,afterEach,before,it} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {Call,StartApp,StopApp} from './appclient';
import {GetDb} from '../src/db';
import {users,characters,inventory,slayerlinks,slayerlinkpools,slayerlinkstate} from '../src/db/schema';
import {SetSlayerLinkClockForTests} from '../src/controllers/slayerlinks';
import {SetPartyClockForTests,ResetPartiesForTests,PollParty,InviteToParty,AcceptPartyInvite,TouchPlayer,LeaveParty} from '../src/controllers/party';
import {ApplyLinkXp,GetLinkTrack,LINK_GRANT_SOURCE} from '../src/controllers/slayerlinklifecycle';
import {LinkRank,ReadLinkPool} from '../src/controllers/slayerlinkconfig';

const WEEK=168*3600000;
const pool=[{catalog_id:'CURRENCY_NOTES',quantity:1000,received_for_level:1},{catalog_id:'CURRENCY_NOTES',quantity:2000,received_for_level:2},{catalog_id:'CURRENCY_NOTES',quantity:3000,received_for_level:-1}];
let now=Date.now();
before(async()=>{await StartApp();});
after(async()=>{await StopApp();RemoveTestDb(()=>GetDb().$client.close());});
afterEach(()=>{SetSlayerLinkClockForTests();SetPartyClockForTests();ResetPartiesForTests();delete process.env.PROGRESSION_MODE;});
function player(){const uid='UID-'+randomUUID(),cid=randomUUID(),date=new Date().toISOString();
    GetDb().insert(users).values({userId:uid,name:uid.slice(-12),notes:0,isAdmin:false}).run();
    GetDb().insert(characters).values({userId:uid,characterId:cid,name:'Test',createdDate:date,lastModifiedDate:date,updateVersion:0,data:'{}'}).run();
    GetDb().insert(inventory).values({characterId:cid,instancedItems:'[]',stackedItems:'[]'}).run();return {uid,cid};}
async function linked(){
    now=Date.now();SetSlayerLinkClockForTests(()=>now);SetPartyClockForTests(()=>now);process.env.PROGRESSION_MODE='real';
    const a=player(),b=player(),id=randomUUID();
    // Legacy rows have no lifecycle state; loading them must preserve the link.
    GetDb().insert(slayerlinks).values({linkId:id,senderId:a.uid,targetId:b.uid,senderSlot:1,targetSlot:2,createdAt:now,endsAt:now+WEEK}).run();
    const party:any=await PollParty(a.uid);await PollParty(b.uid);
    assert.equal(InviteToParty(a.uid,b.uid,party.partyId).Status,200);assert.equal((await AcceptPartyInvite(b.uid,party.partyId)).Status,200);
    return {a,b,id};
}
const store=(uid:string,slot:number,p=pool,extra:any={})=>Call('PUT','/slayerlink/links/rewards',{gs:true,body:{account_id:uid,slot,prize_pool:p,...extra}});
const rewards=(uid:string,slot:number)=>Call('GET',`/slayerlink/links/rewards/${uid}/${slot}`,{gs:true});
const grant=(a:{uid:string,cid:string},tx=randomUUID(),quantity=3000)=>Call('POST','/inventory',{gs:true,body:{accountId:a.uid,characterId:a.cid,transactionId:tx,source:LINK_GRANT_SOURCE,addStackedItems:[{catalogId:'CURRENCY_NOTES',quantity}],addInstancedItems:[]}});
const release=(uid:string,slot:number,id?:string)=>Call('DELETE','/slayerlink/links',{gs:true,body:{links:[{account_id:uid,slot,delete_pair:true,...(id?{link_id:id}:{})}]}});
const points=(uid:string,slot:number)=>GetLinkTrack(uid,`Linked_Slayer_Slot_${slot}`).progress;
const balance=(cid:string)=>JSON.parse(GetDb().select().from(inventory).where(eq(inventory.characterId,cid)).get()!.stackedItems).find((x:any)=>x.catalogId==='CURRENCY_NOTES')?.quantity??0;

it('native shared progression, immutable pools, expired collection, retry-safe inventory and independent release',async()=>{
    const {a,b,id}=await linked();
    assert.equal((await store(a.uid,1)).status,200);assert.equal((await store(b.uid,2)).status,200);
    assert.equal((await store(a.uid,1)).status,200);
    assert.equal((await store(a.uid,1,[pool[1]])).status,409,'cannot reroll a pool');
    const config=await Call('GET','/progression/config',{as:a.uid});
    assert.equal(config.json.payload.paths.filter((x:any)=>x.progression_id.startsWith('Linked_Slayer_Slot_')).length,3);
    const xp={progress_tracks:[{progression_id:'season09b',progress:405}],objectives:[]};
    assert.equal((await Call('POST',`/progression/${a.uid}`,{gs:true,body:xp})).status,200);
    assert.equal(points(a.uid,1),405);assert.equal(points(b.uid,2),405);
    await Call('POST',`/progression/${a.uid}`,{gs:true,body:xp});assert.equal(points(a.uid,1),405,'replayed Hunt Pass award adds no shared XP');
    assert.equal((await Call('POST',`/progression/${a.uid}/Linked_Slayer_Slot_1/999`,{gs:true})).status,200);
    assert.equal(points(a.uid,1),405,'native track echoes do not add shared XP twice');
    assert.equal((await Call('POST',`/progression/${a.uid}/Linked_Slayer_Slot_1/4/confirm/public`,{gs:true})).status,200);
    assert.equal(GetLinkTrack(a.uid,'Linked_Slayer_Slot_1').confirmed_fremium_rank,2,'confirmed rank clamps to earned');
    assert.equal((await release(a.uid,1,id)).status,409,'earned active link cannot be discarded');
    assert.equal((await rewards(a.uid,1)).status,409,'cannot collect early');
    now+=WEEK+1;
    assert.equal((await Call('GET','/slayerlink/links',{as:a.uid})).json.payload.links.length,1,'expired link remains visible');
    assert.equal((await release(a.uid,1,id)).status,409,'unclaimed expired reward is retained');
    assert.equal((await rewards(a.uid,1)).json.payload.rewards.length,2);
    assert.equal((await grant(a,randomUUID(),999999)).status,409,'tampered totals rejected');
    assert.equal(balance(a.cid),0);
    const tx=randomUUID();assert.equal((await grant(a,tx)).status,200);assert.equal(balance(a.cid),3000);
    assert.equal((await grant(a,tx)).status,200);assert.equal((await grant(a)).status,200);assert.equal(balance(a.cid),3000,'fresh transaction ID cannot claim twice');
    assert.equal((await release(a.uid,1,id)).status,200);assert.equal(points(a.uid,1),0);
    assert.equal((await Call('GET','/slayerlink/links',{as:b.uid})).json.payload.links.length,1,'partner retains collection');
    assert.equal((await rewards(b.uid,2)).json.payload.rewards.length,2);
    assert.equal((await grant(b)).status,200);assert.equal(balance(b.cid),3000);
    assert.equal((await release(b.uid,2,id)).status,200);
    // Reuse must start from zero and reject a late request identifying the previous generation.
    GetDb().insert(slayerlinks).values({linkId:randomUUID(),senderId:a.uid,targetId:b.uid,senderSlot:1,targetSlot:2,createdAt:now,endsAt:now+WEEK}).run();
    assert.equal(points(a.uid,1),0);assert.equal((await release(a.uid,1,id)).status,409);
});

it('missing pools preserve earned rewards, unauthorized and malformed requests change nothing',async()=>{
    const {a,b,id}=await linked();
    GetDb().transaction(tx=>ApplyLinkXp(tx,a.uid,5,'event-one'));
    GetDb().transaction(tx=>ApplyLinkXp(tx,a.uid,5,'event-one'));
    assert.equal(points(a.uid,1),5,'same event is not credited twice');
    now+=WEEK+1;
    assert.equal((await rewards(a.uid,1)).status,409);assert.equal((await release(a.uid,1)).status,409);
    assert.equal((await Call('PUT','/slayerlink/links/rewards',{as:a.uid,body:{account_id:a.uid,slot:1,prize_pool:pool}})).status,403);
    assert.equal((await Call('PUT','/slayerlink/links/rewards',{as:b.uid,gs:true,body:{account_id:a.uid,slot:1,prize_pool:pool}})).status,403);
    assert.equal((await Call('GET',`/slayerlink/links/rewards/${a.uid}/1`,{as:b.uid})).status,403);
    assert.equal((await store(a.uid,1,[{...pool[0],catalog_id:'NOT_A_PRIZE'}])).status,400);
    assert.equal((await store(a.uid,1,[pool[0],pool[0]])).status,400);
    assert.equal((await store(a.uid,1,pool,{link_id:'stale'})).status,409);
    assert.equal((await store(a.uid,1)).status,200,'late native generation repairs missing pool without losing earned XP');
    assert.equal((await grant(a,randomUUID(),1000)).status,409,'must first serve rewards to a game server');
    assert.equal((await Call('GET',`/slayerlink/links/rewards/${a.uid}/1`,{as:a.uid})).status,200);
    assert.equal((await grant(a,randomUUID(),1000)).status,409,'player read cannot authorize collection');
    await rewards(a.uid,1);assert.equal((await grant(a,randomUUID(),1000)).status,200);
    assert.equal(balance(a.cid),1000);assert.equal(points(b.uid,2),5);
    assert.equal(GetDb().select().from(slayerlinkpools).where(eq(slayerlinkpools.linkId,id)).all().length,1);
});

it('XP requires a current linked party member and authenticated game-server progression',async()=>{
    const {a,b}=await linked();
    const xp={progress_tracks:[{progression_id:'season09b',progress:11}],objectives:[]};
    assert.equal((await Call('POST',`/progression/${a.uid}`,{as:a.uid,body:xp})).status,403);assert.equal(points(a.uid,1),0);
    now+=90001;GetDb().transaction(tx=>ApplyLinkXp(tx,a.uid,10,'offline'));assert.equal(points(a.uid,1),0);
    TouchPlayer(b.uid);GetDb().transaction(tx=>ApplyLinkXp(tx,a.uid,5,'online'));assert.equal(points(a.uid,1),5);
    await LeaveParty(b.uid);GetDb().transaction(tx=>ApplyLinkXp(tx,a.uid,10,'apart'));assert.equal(points(a.uid,1),5);
    assert.deepEqual([0,4,5,404,405,1204,1205,2804,2805].map(LinkRank),[0,0,1,1,2,2,3,3,4]);
    assert.throws(()=>ReadLinkPool(null));
    assert.equal((await Call('GET',`/progression/${a.uid}/Linked_Slayer_Slot_4`,{as:a.uid})).status,404);
});

it('batch deletion rolls back all entries on error and never releases a partner through delete_pair',async()=>{
    const {a,b,id}=await linked();
    const res=await Call('DELETE','/slayerlink/links',{gs:true,body:{links:[{account_id:a.uid,slot:1},{account_id:b.uid,slot:99}]}});
    assert.equal(res.status,400);assert.equal(GetDb().select().from(slayerlinks).where(eq(slayerlinks.linkId,id)).all().length,1);
    now+=WEEK+1;assert.equal((await release(a.uid,1)).status,200);
    assert.equal((await Call('GET','/slayerlink/links',{as:b.uid})).json.payload.links.length,1);
    assert.equal(GetDb().select().from(slayerlinkstate).where(eq(slayerlinkstate.linkId,id)).get()!.targetReleasedAt,null);
});
