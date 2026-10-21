import {createHash} from 'node:crypto';
import {and,desc,eq,like} from 'drizzle-orm';
import {GetDb} from '../db';
import {characters,inventory,onetimejobs,progressionevents,users} from '../db/schema';
import catalog from '../vendor/admin_grant_catalog.json';
import {ApplyInventoryTransactionInTx,MAX_STACK_QUANTITY} from './inventory';
import {RecordProgressionEvent} from './progressionevents';

export class RewardError extends Error {constructor(public status:number,message:string){super(message);}}
const Items=new Map(catalog.items.map(item=>[item.id,item]));
const uid=(value:unknown):value is string=>typeof value==='string'&&/^UID-[A-Za-z0-9-]{1,100}$/.test(value);
const prefix='admin AccountGrant:';

export function RewardCatalog(query:unknown='',category:unknown=''){
    if(typeof query!=='string'||query.length>100||typeof category!=='string'||category.length>30)throw new RewardError(400,'Invalid catalogue search');
    const q=query.trim().toLowerCase();
    const found=catalog.items.filter(item=>(!category||item.category===category)&&`${item.name} ${item.id}`.toLowerCase().includes(q));
    return {items:found.slice(0,100),total:found.length,categories:[...new Set(catalog.items.map(item=>item.category))]};
}

export function RewardAccount(accountId:unknown){
    if(!uid(accountId))throw new RewardError(400,'Invalid account ID');
    const db=GetDb(),account=db.select().from(users).where(eq(users.userId,accountId)).get();
    if(!account)throw new RewardError(404,'Account not found');
    const owned=db.select({id:characters.characterId,name:characters.name}).from(characters).where(eq(characters.userId,accountId)).all();
    const history=db.select({at:progressionevents.time,body:progressionevents.body,reply:progressionevents.reply}).from(progressionevents)
        .where(and(eq(progressionevents.accountId,accountId),like(progressionevents.route,`${prefix}%`))).orderBy(desc(progressionevents.id)).limit(25).all()
        .map(row=>{const body=JSON.parse(row.body!),reply=JSON.parse(row.reply!);return {at:row.at,actor:body.actorId,reason:body.reason,...reply};});
    return {id:account.userId,name:account.name,characters:owned,history};
}

export function GrantReward(actorId:string,input:unknown){
    if(!input||typeof input!=='object'||Array.isArray(input))throw new RewardError(400,'Invalid reward request');
    const b=input as Record<string,unknown>;
    if(Object.keys(b).some(k=>!['accountId','characterId','catalogId','quantity','reason','requestId'].includes(k)))throw new RewardError(400,'Unexpected reward field');
    if(!uid(b.accountId)||typeof b.characterId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(b.characterId)||typeof b.catalogId!=='string')throw new RewardError(400,'Select an account, character and catalogue item');
    if(typeof b.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(b.requestId))throw new RewardError(400,'Invalid reward request ID');
    if(typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>500||/[\x00-\x1f\x7f]/.test(b.reason))throw new RewardError(400,'An audit reason of 1–500 characters is required');
    const item=Items.get(b.catalogId);
    if(!item)throw new RewardError(400,'Item is not in the verified rewards catalogue');
    const max=item.unique?1:item.category==='Currency'?10000000:10000;
    if(typeof b.quantity!=='number'||!Number.isSafeInteger(b.quantity)||b.quantity<1||b.quantity>max)throw new RewardError(400,`Quantity must be a whole number from 1 to ${max}`);
    const request={actorId,accountId:b.accountId,characterId:b.characterId,catalogId:item.id,quantity:b.quantity,reason:b.reason.trim(),requestId:b.requestId};
    const body=JSON.stringify(request),receipt=`dashboard-grant:${b.requestId}`,route=prefix+b.requestId;
    return GetDb().transaction(tx=>{
        // Inventory receipts expire after 30 days. A permanent marker makes old retries harmless too.
        if(tx.select().from(onetimejobs).where(eq(onetimejobs.jobId,receipt)).get()){
            const previous=tx.select().from(progressionevents).where(and(eq(progressionevents.accountId,request.accountId),eq(progressionevents.route,route))).get();
            if(!previous||previous.body!==body)throw new RewardError(409,'Request ID was already used for a different grant');
            return {...JSON.parse(previous.reply!),replayed:true};
        }
        const owner=tx.select().from(users).where(eq(users.userId,request.accountId)).get();
        const character=tx.select().from(characters).where(and(eq(characters.userId,request.accountId),eq(characters.characterId,request.characterId))).get();
        if(!owner||!character)throw new RewardError(404,'Character does not belong to this account');
        const row=tx.select().from(inventory).where(eq(inventory.characterId,request.characterId)).get();
        const stacked:any[]=row?JSON.parse(row.stackedItems):[],instanced:any[]=row?JSON.parse(row.instancedItems):[];
        if(!Array.isArray(stacked)||!Array.isArray(instanced))throw new RewardError(409,'Inventory needs repair before granting rewards');
        const stacks=stacked.filter(i=>i.catalogId===item.id);
        if(stacks.some(i=>!Number.isSafeInteger(i.quantity)||i.quantity<0))throw new RewardError(409,'Invalid existing item balance');
        const before=stacks.reduce((n,i)=>n+i.quantity,0)+instanced.filter(i=>i.catalogId===item.id).length;
        const added=item.unique&&before>0?0:request.quantity;
        if(!Number.isSafeInteger(before)||before>MAX_STACK_QUANTITY-added)throw new RewardError(409,'Reward would exceed the game inventory limit');
        if(added){
            ApplyInventoryTransactionInTx(tx,{UserId:request.accountId,CharacterId:request.characterId,TransactionId:receipt,
                ...(item.kind==='stacked'?{StackedItemsToAdd:[{catalogId:item.id,quantity:added}]}:{InstancedItemsToAdd:[{catalogId:item.id,instanceId:createHash('sha256').update(receipt).digest('hex').slice(0,32),updateVersion:0}]})
            },{Caller:'admin',Source:`dashboard-reward:${actorId}`});
        }
        const result={requestId:request.requestId,accountId:request.accountId,accountName:owner.name,characterId:request.characterId,characterName:character.name,catalogId:item.id,itemName:item.name,added,before,after:before+added,replayed:false};
        tx.insert(onetimejobs).values({jobId:receipt,doneDate:new Date().toISOString()}).run();
        RecordProgressionEvent(tx,{AccountId:request.accountId,Caller:'admin',Route:route,Body:request,Status:200,Reply:result});
        return result;
    },{behavior:'immediate'});
}
