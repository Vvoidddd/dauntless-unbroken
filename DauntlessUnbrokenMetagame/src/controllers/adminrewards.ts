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
const Cosmetics=catalog.items.filter(item=>['Transmogs','Dyes','Other cosmetics'].includes(item.category)&&item.unique);
const Bundles=[
    {id:'cosmetics',name:'All cosmetics',items:Cosmetics},
    {id:'transmogs',name:'All skins / transmogs',items:Cosmetics.filter(item=>item.category==='Transmogs')},
    {id:'dyes',name:'All dyes',items:Cosmetics.filter(item=>item.category==='Dyes')},
    {id:'flares',name:'All flares',items:Cosmetics.filter(item=>item.id.startsWith('QI_FLARE_'))},
    {id:'weapons',name:'All weapons at max rank',items:catalog.items.filter(item=>typeof item.maxRank==='number')}
];

export function RewardCatalog(query:unknown='',category:unknown=''){
    if(typeof query!=='string'||query.length>100||typeof category!=='string'||category.length>30)throw new RewardError(400,'Invalid catalogue search');
    const q=query.trim().toLowerCase();
    const found=catalog.items.filter(item=>(!category||item.category===category)&&`${item.name} ${item.id}`.toLowerCase().includes(q));
    return {items:found.slice(0,100),total:found.length,categories:[...new Set(catalog.items.map(item=>item.category))],bundles:Bundles.map(({id,name,items})=>({id,name,total:items.length}))};
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
    if(Object.keys(b).some(k=>!['accountId','characterId','catalogId','quantity','reason','requestId','rank','bundle'].includes(k)))throw new RewardError(400,'Unexpected reward field');
    if(!uid(b.accountId)||typeof b.characterId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(b.characterId))throw new RewardError(400,'Select an account and character');
    if(typeof b.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(b.requestId))throw new RewardError(400,'Invalid reward request ID');
    if(typeof b.reason!=='string'||!b.reason.trim()||b.reason.length>500||/[\x00-\x1f\x7f]/.test(b.reason))throw new RewardError(400,'An audit reason of 1–500 characters is required');
    const bundle=Bundles.find(entry=>entry.id===b.bundle),item=typeof b.catalogId==='string'?Items.get(b.catalogId):undefined;
    const weapon=typeof item?.maxRank==='number';
    if(b.bundle!==undefined){
        if(!bundle)throw new RewardError(400,'Unknown reward bundle');
        if(['catalogId','quantity','rank'].some(key=>key in b))throw new RewardError(400,'Bulk grants cannot include an item, quantity or rank');
    }else{
        if(!item)throw new RewardError(400,'Item is not in the verified rewards catalogue');
        if(weapon&&(typeof b.rank!=='number'||!Number.isInteger(b.rank)||b.rank<0||b.rank>item.maxRank!))throw new RewardError(400,`Weapon rank must be a whole number from 0 to ${item.maxRank}`);
        if(!weapon&&b.rank!==undefined)throw new RewardError(400,'Rank applies only to weapons and upgradeable weapon parts');
        const max=item.unique?1:item.category==='Currency'?10000000:10000;
        if(typeof b.quantity!=='number'||!Number.isSafeInteger(b.quantity)||b.quantity<1||b.quantity>max)throw new RewardError(400,`Quantity must be a whole number from 1 to ${max}`);
    }
    // Keep the single-item receipt serialization unchanged for existing retries.
    const request={actorId,accountId:b.accountId,characterId:b.characterId,...(bundle?{bundle:bundle.id}:{catalogId:item!.id,quantity:b.quantity as number}),reason:b.reason.trim(),requestId:b.requestId,...(weapon?{rank:b.rank as number}:{})};
    const entries=bundle?bundle.items:[item!];
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
        const StackedItemsToAdd:any[]=[],InstancedItemsToAdd:any[]=[],InstancedItemsToSave:any[]=[];
        let before=0,added=0,upgradedCount=0,rankBefore:number|null=null,rankAfter:number|undefined,upgraded=false;
        for(const entry of entries){
            const stacks=stacked.filter(i=>i.catalogId===entry.id),owned=instanced.filter(i=>i.catalogId===entry.id);
            if(stacks.some(i=>!Number.isSafeInteger(i.quantity)||i.quantity<0))throw new RewardError(409,'Invalid existing item balance');
            const count=stacks.reduce((n,i)=>n+i.quantity,0)+owned.length;
            const quantity=bundle?1:(b.quantity as number),add=entry.unique&&count>0?0:quantity;
            if(!Number.isSafeInteger(count)||count>MAX_STACK_QUANTITY-add)throw new RewardError(409,'Reward would exceed the game inventory limit');
            before+=count;added+=add;
            if(typeof entry.maxRank==='number'){
                if(stacks.length||owned.length>1)throw new RewardError(409,'Weapon inventory needs repair before granting ranks');
                const existing=owned[0];
                let data:any={TransmogCatalogID:'None',UnlockedAsTransmog:false,CurrentLevel:0,DataVersion:1,EquippedCells:[],EquippedWeaponParts:[],CurrentXP:0};
                if(existing?.itemData!=null){
                    try{const saved=JSON.parse(existing.itemData);if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error();data={...data,...saved};}
                    catch{throw new RewardError(409,'Weapon data needs repair before granting ranks');}
                }
                if(!Number.isInteger(data.CurrentLevel)||data.CurrentLevel<0||data.CurrentLevel>entry.maxRank)throw new RewardError(409,'Invalid existing weapon rank');
                rankBefore=existing?data.CurrentLevel:null;
                rankAfter=Math.max(data.CurrentLevel,bundle?entry.maxRank:(b.rank as number));
                if(!existing||rankAfter>data.CurrentLevel||existing.itemData==null){
                    const version=existing?.updateVersion??0;
                    if(!Number.isSafeInteger(version)||version<0||version>=MAX_STACK_QUANTITY)throw new RewardError(409,'Invalid existing weapon version');
                    const granted={...(existing??{catalogId:entry.id,instanceId:entry.id}),updateVersion:existing?version+1:0,itemData:JSON.stringify({...data,CurrentLevel:rankAfter})};
                    if(!existing&&instanced.some(i=>i.instanceId===granted.instanceId))throw new RewardError(409,'Weapon instance identity is already in use');
                    (existing?InstancedItemsToSave:InstancedItemsToAdd).push(granted);
                    upgraded=!!existing;
                    if(existing)upgradedCount++;
                }
            }else if(add){
                if(entry.kind==='stacked')StackedItemsToAdd.push({catalogId:entry.id,quantity:add});
                else InstancedItemsToAdd.push({catalogId:entry.id,instanceId:createHash('sha256').update(bundle?`${receipt}:${entry.id}`:receipt).digest('hex').slice(0,32),updateVersion:0});
            }
        }
        if(StackedItemsToAdd.length||InstancedItemsToAdd.length||InstancedItemsToSave.length){
            ApplyInventoryTransactionInTx(tx,{UserId:request.accountId,CharacterId:request.characterId,TransactionId:receipt,
                StackedItemsToAdd,InstancedItemsToAdd,InstancedItemsToSave
            },{Caller:'admin',Source:`dashboard-reward:${actorId}`});
        }
        const result={requestId:request.requestId,accountId:request.accountId,accountName:owner.name,characterId:request.characterId,characterName:character.name,catalogId:item?.id??null,itemName:bundle?.name??item!.name,added,before,after:before+added,replayed:false,...(weapon?{rankBefore,rankAfter,upgraded}:{}),...(bundle?{bundle:bundle.id,total:entries.length,upgradedCount,skipped:entries.length-added-upgradedCount}:{})};
        tx.insert(onetimejobs).values({jobId:receipt,doneDate:new Date().toISOString()}).run();
        RecordProgressionEvent(tx,{AccountId:request.accountId,Caller:'admin',Route:route,Body:request,Status:200,Reply:result});
        return result;
    },{behavior:'immediate'});
}
