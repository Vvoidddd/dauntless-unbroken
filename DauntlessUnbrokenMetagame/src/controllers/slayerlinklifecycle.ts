import {createHash,randomUUID} from 'node:crypto';
import {and,eq,or} from 'drizzle-orm';
import {GetDb} from '../db';
import {characters,slayerlinks,slayerlinkstate,slayerlinkpools,slayerlinkxp,slayerlinkinvites} from '../db/schema';
import type {Tx} from './savehistory';
import {ApplyInventoryTransactionInTx,type InventoryTransactionRequest,type TransactionResponse} from './inventory';
import {GetPartyOf,SeenWithinMs} from './party';
import {SlayerLinks} from '../features';
import {LinkRank,LinkTrackId,ParseLinkTrack,ReadLinkPool,type LinkPrize} from './slayerlinkconfig';

export const LINK_GRANT_SOURCE='SlayerLinks.GrantRewards';
export class SlayerLinkError extends Error{constructor(public status:number,message:string){super(message);}}
let Clock=()=>Date.now();
export function SetLinkLifecycleClock(fn?:()=>number){Clock=fn??(()=>Date.now());}
const defaults={progress:0,canceledAt:null,senderReleasedAt:null,targetReleasedAt:null,senderConfirmedRank:0,targetConfirmedRank:0};
type LinkReader=Pick<Tx,'select'>;

export type StoredLink=typeof slayerlinks.$inferSelect & typeof slayerlinkstate.$inferSelect;
export function LinksFor(tx:LinkReader,uid:string):StoredLink[]{
    return tx.select({link:slayerlinks,state:slayerlinkstate}).from(slayerlinks).leftJoin(slayerlinkstate,eq(slayerlinks.linkId,slayerlinkstate.linkId))
        .where(or(eq(slayerlinks.senderId,uid),eq(slayerlinks.targetId,uid))).all().map(x=>({...x.link,...defaults,...x.state}));
}
export const Side=(link:StoredLink,uid:string)=>link.senderId===uid?'sender':'target';
export const LinkSlot=(link:StoredLink,uid:string)=>link.senderId===uid?link.senderSlot:link.targetSlot;
export const Released=(link:StoredLink,uid:string)=>link.senderId===uid?link.senderReleasedAt:link.targetReleasedAt;
export function ListedLinks(tx:LinkReader,uid:string){return LinksFor(tx,uid).filter(x=>x.canceledAt===null&&Released(x,uid)===null);}
function Resolve(tx:LinkReader,uid:string,slot:number){
    if(!Number.isInteger(slot)||slot<1||slot>3)throw new SlayerLinkError(400,'Invalid Slayer Link slot');
    return ListedLinks(tx,uid).find(x=>LinkSlot(x,uid)===slot);
}
function State(tx:Tx,link:StoredLink,values:Partial<typeof slayerlinkstate.$inferInsert>){
    tx.insert(slayerlinkstate).values({linkId:link.linkId,...values}).onConflictDoUpdate({target:slayerlinkstate.linkId,set:values}).run();
}
const Pool=(tx:LinkReader,id:string,uid:string)=>tx.select().from(slayerlinkpools).where(and(eq(slayerlinkpools.linkId,id),eq(slayerlinkpools.userId,uid))).get();
export function PrizePool(tx:LinkReader,id:string,uid:string):LinkPrize[]{return JSON.parse(Pool(tx,id,uid)?.pool??'[]');}
function Earned(link:StoredLink,pool:LinkPrize[]){return pool.filter(x=>x.received_for_level>0&&x.received_for_level<=LinkRank(link.progress));}
function AssertGeneration(link:StoredLink|undefined,expected:unknown){if(expected!==undefined&&(!link||expected!==link.linkId))throw new SlayerLinkError(409,'Slayer Link generation changed');}
export type LinkAuth={IsGameserver?:boolean;userId?:string};
function Actor(auth:LinkAuth,named:unknown){
    if(auth.IsGameserver){
        if(typeof named!=='string'||named.length===0)throw new SlayerLinkError(400,'account_id is required');
        if(auth.userId!==undefined&&auth.userId!==named)throw new SlayerLinkError(403,'Relayed account mismatch');
        return named;
    }
    if(!auth.userId)throw new SlayerLinkError(401,'Player identity required');
    if(named!==undefined&&named!==auth.userId)throw new SlayerLinkError(403,'Cannot act for another account');
    return auth.userId;
}
function DeleteSide(tx:Tx,uid:string,slot:number,expected?:unknown){
    const link=Resolve(tx,uid,slot);AssertGeneration(link,expected);if(!link)return;
    if(Clock()<link.endsAt){
        if(link.progress>0)throw new SlayerLinkError(409,'An earning Slayer Link cannot be canceled');
        tx.delete(slayerlinkpools).where(eq(slayerlinkpools.linkId,link.linkId)).run();
        tx.delete(slayerlinkstate).where(eq(slayerlinkstate.linkId,link.linkId)).run();
        tx.delete(slayerlinks).where(eq(slayerlinks.linkId,link.linkId)).run();
        tx.update(slayerlinkinvites).set({status:'CANCELED'}).where(eq(slayerlinkinvites.inviteId,link.linkId)).run();return;
    }
    const pool=Pool(tx,link.linkId,uid);
    if(!pool&&LinkRank(link.progress)>0)throw new SlayerLinkError(409,'Earned rewards are waiting for their prize pool');
    if(pool?.claimedAt==null&&Earned(link,JSON.parse(pool?.pool??'[]')).length>0)throw new SlayerLinkError(409,'Collect the earned rewards before releasing this link');
    State(tx,link,Side(link,uid)==='sender'?{senderReleasedAt:Clock()}:{targetReleasedAt:Clock()});
}
export function DeleteLinkSide(uid:string,slot:number,expected?:unknown){return GetDb().transaction(tx=>DeleteSide(tx,uid,slot,expected));}
export function DeleteLinkEntries(auth:LinkAuth,entries:unknown){
    if(!Array.isArray(entries)||!entries.length||entries.length>3)throw new SlayerLinkError(400,'Expected one to three link entries');
    return GetDb().transaction(tx=>{for(const entry of entries)DeleteSide(tx,Actor(auth,entry?.account_id),entry?.slot,entry?.link_id);return {};});
}
export function StoreLinkPools(auth:LinkAuth,body:any){
    if(!auth.IsGameserver)throw new SlayerLinkError(403,'Only game servers may store prize pools');
    const entries=Array.isArray(body)?body:Array.isArray(body?.links)?body.links:body?.prize_pool?[body]:[];
    if(!entries.length||entries.length>3)throw new SlayerLinkError(400,'Expected one to three prize pools');
    return GetDb().transaction(tx=>({links:entries.map((entry:any)=>{
        const uid=Actor(auth,entry?.account_id),link=Resolve(tx,uid,entry?.slot);AssertGeneration(link,entry?.link_id);
        if(!link)throw new SlayerLinkError(404,'No link in that slot');
        let pool:LinkPrize[];try{pool=ReadLinkPool(entry?.prize_pool);}catch(e){throw new SlayerLinkError(400,(e as Error).message);}
        const encoded=JSON.stringify(pool),hash=createHash('sha256').update(encoded).digest('hex'),old=Pool(tx,link.linkId,uid);
        if(old){if(old.poolHash!==hash)throw new SlayerLinkError(409,'A prize pool cannot be rerolled');return {linkId:link.linkId,stored:false};}
        tx.insert(slayerlinkpools).values({linkId:link.linkId,userId:uid,pool:encoded,poolHash:hash,createdAt:Clock()}).run();
        return {linkId:link.linkId,stored:true};
    })}));
}
export function GetLinkRewards(auth:LinkAuth,named:string,slot:number){
    const uid=Actor(auth,named);
    return GetDb().transaction(tx=>{
        const link=Resolve(tx,uid,slot);if(!link)throw new SlayerLinkError(404,'No link in that slot');
        if(Clock()<link.endsAt)throw new SlayerLinkError(409,'The link has not ended');
        const pool=Pool(tx,link.linkId,uid);
        if(!pool&&LinkRank(link.progress)>0)throw new SlayerLinkError(409,'Earned rewards are waiting for their prize pool');
        if(pool&&pool.claimedAt===null&&auth.IsGameserver)tx.update(slayerlinkpools).set({servedAt:Clock()}).where(and(eq(slayerlinkpools.linkId,link.linkId),eq(slayerlinkpools.userId,uid))).run();
        return {is_service_granting:false,rewards:pool?.claimedAt==null?Earned(link,JSON.parse(pool?.pool??'[]')):[]};
    });
}
function Totals(items:{catalogId:string;quantity:number}[]){
    const totals=new Map<string,number>();for(const item of items){
        if(typeof item?.catalogId!=='string'||!Number.isSafeInteger(item.quantity)||item.quantity<=0)throw new SlayerLinkError(400,'Malformed reward item');
        const amount=(totals.get(item.catalogId)??0)+item.quantity;if(!Number.isSafeInteger(amount))throw new SlayerLinkError(400,'Invalid reward total');totals.set(item.catalogId,amount);
    }return totals;
}
const Same=(a:Map<string,number>,b:Map<string,number>)=>a.size===b.size&&[...a].every(([id,n])=>b.get(id)===n);
const RewardTotals=(items:LinkPrize[])=>Totals(items.map(x=>({catalogId:x.catalog_id,quantity:x.quantity})));
const EmptyResponse=():TransactionResponse=>({createdInstancedItems:[],updatedInstancedItems:[],updatedStackedItems:[],removedInstancedItems:[]});
// Called instead of the ordinary inventory route for this native source. Claim and
// inventory commit together. A fresh transaction ID alone is not a new entitlement.
export function GrantLinkRewards(auth:LinkAuth,request:InventoryTransactionRequest):TransactionResponse{
    if(!auth.IsGameserver)throw new SlayerLinkError(403,'Only game servers may grant link rewards');
    const uid=Actor(auth,request.UserId),adds=request.StackedItemsToAdd??[],instances=request.InstancedItemsToAdd??[];
    for(const list of [adds,instances,request.InstancedItemsToRemove??[],request.StackedItemsToRemove??[],request.InstancedItemsToSave??[]])if(!Array.isArray(list))throw new SlayerLinkError(400,'Malformed reward arrays');

    if(request.InstancedItemsToRemove?.length||request.StackedItemsToRemove?.length||request.InstancedItemsToSave?.length)throw new SlayerLinkError(400,'Link rewards may only add items');
    if(typeof request.TransactionId!=='string'||!request.TransactionId||request.TransactionId.length>160)throw new SlayerLinkError(400,'A transaction ID is required');
    const transactionId=request.TransactionId;

    const wanted=Totals([...adds,...instances.map((x:any)=>({catalogId:x?.catalogId,quantity:1}))]);if(!wanted.size)throw new SlayerLinkError(400,'Empty reward grant');
    return GetDb().transaction(tx=>{
        const character=tx.select().from(characters).where(eq(characters.characterId,request.CharacterId)).get();
        if(character?.userId!==uid)throw new SlayerLinkError(403,'Character does not belong to account');
        const candidates=LinksFor(tx,uid).filter(x=>x.canceledAt===null&&x.endsAt<=Clock()).map(link=>({link,pool:Pool(tx,link.linkId,uid)})).filter(x=>x.pool!==undefined);
        const replay=candidates.find(x=>x.pool!.claimTransactionId===request.TransactionId);
        if(replay){
            if(replay.pool!.claimCharacterId!==request.CharacterId)throw new SlayerLinkError(409,'Claim belongs to another character');
            if(!Same(RewardTotals(JSON.parse(replay.pool!.claimedRewards??'[]')),wanted))throw new SlayerLinkError(409,'Claim retry has different rewards');
            return EmptyResponse(); // The inventory retry ledger may have expired; the entitlement remains consumed.
        }
        const match=candidates.filter(x=>x.pool!.claimedAt===null&&x.pool!.servedAt!==null&&Released(x.link,uid)===null&&Same(RewardTotals(Earned(x.link,JSON.parse(x.pool!.pool))),wanted)).sort((a,b)=>b.pool!.servedAt!-a.pool!.servedAt!)[0];
        if(match){
            const applied=ApplyInventoryTransactionInTx(tx,request,{Caller:'gameserver',Source:LINK_GRANT_SOURCE});
            tx.update(slayerlinkpools).set({claimTransactionId:transactionId,claimCharacterId:request.CharacterId,claimedRewards:JSON.stringify(Earned(match.link,JSON.parse(match.pool!.pool))),claimedAt:Clock()}).where(and(eq(slayerlinkpools.linkId,match.link.linkId),eq(slayerlinkpools.userId,uid))).run();
            return applied.response;
        }
        if(candidates.some(x=>x.pool!.claimedAt!==null&&Same(RewardTotals(JSON.parse(x.pool!.claimedRewards??'[]')),wanted)))return EmptyResponse();
        throw new SlayerLinkError(409,'Grant does not match served, unclaimed Slayer Link rewards');
    });
}
export function ApplyLinkXp(tx:Tx,uid:string,amount:number,eventId:string=randomUUID()){
    if(!SlayerLinks()||!Number.isSafeInteger(amount)||amount<=0)return;
    const party=GetPartyOf(uid);if(!party)return;
    for(const link of ListedLinks(tx,uid)){
        const partner=link.senderId===uid?link.targetId:link.senderId;
        if(link.createdAt>Clock()||link.endsAt<=Clock()||!party.Members.includes(partner)||!SeenWithinMs(partner,90000))continue;
        if(tx.select().from(slayerlinkxp).where(and(eq(slayerlinkxp.eventId,eventId),eq(slayerlinkxp.linkId,link.linkId))).get())continue;
        const total=link.progress+amount;if(total>2147483647)throw new SlayerLinkError(400,'Link progress exceeds int32');
        tx.insert(slayerlinkxp).values({eventId,linkId:link.linkId,sourceUserId:uid,amount,createdAt:Clock()}).run();State(tx,link,{progress:total});
    }
}
export function GetLinkTrack(uid:string,track:string){
    const slot=ParseLinkTrack(track);if(slot===undefined)throw new SlayerLinkError(404,'Unknown link track');
    const link=Resolve(GetDb(),uid,slot);
    return {phx_account_id:uid,progression_id:LinkTrackId(slot),progress:link?.progress??0,confirmed_fremium_rank:link?(Side(link,uid)==='sender'?link.senderConfirmedRank:link.targetConfirmedRank):0,confirmed_premium_rank:0,confirmed_date:new Date(link?.createdAt??0).toISOString()};
}
export function ConfirmLinkRank(uid:string,track:string,rank:number){
    const slot=ParseLinkTrack(track);if(slot===undefined)throw new SlayerLinkError(404,'Unknown link track');
    if(!Number.isSafeInteger(rank)||rank<0)throw new SlayerLinkError(400,'Invalid link rank');
    GetDb().transaction(tx=>{const link=Resolve(tx,uid,slot);if(!link)return;const old=Side(link,uid)==='sender'?link.senderConfirmedRank:link.targetConfirmedRank,next=Math.max(old,Math.min(rank,LinkRank(link.progress)));State(tx,link,Side(link,uid)==='sender'?{senderConfirmedRank:next}:{targetConfirmedRank:next});});
    return GetLinkTrack(uid,track);
}
