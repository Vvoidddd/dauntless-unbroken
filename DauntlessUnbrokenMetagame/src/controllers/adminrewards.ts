import {createHash} from 'node:crypto';
import {and,desc,eq,like} from 'drizzle-orm';
import {GetDb} from '../db';
import {characters,entitlements,inventory,onetimejobs,progressionevents,users} from '../db/schema';
import catalog from '../vendor/admin_grant_catalog.json';
import {ApplyInventoryTransactionInTx,MAX_STACK_QUANTITY} from './inventory';
import {RecordProgressionEvent} from './progressionevents';
import {GrantEntitlementInTx} from './entitlements';

export class RewardError extends Error {constructor(public status:number,message:string){super(message);}}
const RewardItems:((typeof catalog.items)[number]&{unit?:string})[]=[...catalog.items,{id:'escalation_xp_boost_entitlement',name:'Escalation XP boost',category:'Boosts',kind:'entitlement',unique:false,grantable:true,unit:'hours',aliases:['esca boost','escalation boost']}];
const Items=new Map(RewardItems.map(item=>[item.id,item]));
const uid=(value:unknown):value is string=>typeof value==='string'&&/^UID-[A-Za-z0-9-]{1,100}$/.test(value);
const prefix='admin AccountGrant:';
const CosmeticCategories=['Transmogs','Dyes','Other cosmetics','Titles','Flares','Banner sigils','Banner fabrics','Banner standards','Banner plants'];
const Cosmetics=catalog.items.filter(item=>item.grantable&&CosmeticCategories.includes(item.category)&&item.unique);
const Bundles=[
    {id:'cosmetics',name:'All cosmetics',items:Cosmetics},
    {id:'transmogs',name:'All skins / transmogs',items:Cosmetics.filter(item=>item.category==='Transmogs')},
    {id:'dyes',name:'All dyes',items:Cosmetics.filter(item=>item.category==='Dyes')},
    {id:'flares',name:'All flares',items:Cosmetics.filter(item=>item.id.startsWith('QI_FLARE_')||item.id==='QI_BASIC_FLARE_DURABLE')},
    {id:'weapons',name:'All weapons at max rank',items:catalog.items.filter(item=>item.grantable&&['Weapons','Weapon parts'].includes(item.category)&&typeof item.maxRank==='number')},
    {id:'armour',name:'All armour at max rank',items:catalog.items.filter(item=>item.grantable&&item.category==='Armour'&&typeof item.maxRank==='number')}
];
const SearchText=(value:string)=>value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const SearchItems=RewardItems.map(item=>({item,name:SearchText(item.name),id:SearchText(item.id),text:SearchText(`${item.name} ${item.id} ${item.category} ${(item.aliases??[]).join(' ')}`)}));

export function RewardCatalog(query:unknown='',category:unknown='',offset:unknown=0){
    if(typeof query!=='string'||query.length>100||typeof category!=='string'||category.length>30)throw new RewardError(400,'Invalid catalogue search');
    const start=typeof offset==='string'&&/^\d+$/.test(offset)?Number(offset):offset;
    if(typeof start!=='number'||!Number.isSafeInteger(start)||start<0||start>100000)throw new RewardError(400,'Invalid catalogue offset');
    const q=SearchText(query),words=q.split(' ').filter(Boolean);
    const found=SearchItems.filter(({item,text})=>(!category||item.category===category)&&(words.every(word=>text.includes(word))||text.replaceAll(' ','').includes(q.replaceAll(' ',''))));
    const score=(entry:typeof SearchItems[number])=>!q?0:entry.name===q||entry.id===q?0:entry.name.startsWith(q)?1:words.every(word=>entry.name.includes(word))?2:3;
    found.sort((a,b)=>score(a)-score(b)||Number(b.item.grantable)-Number(a.item.grantable));
    return {items:found.slice(start,start+100).map(({item})=>item),total:found.length,offset:start,hasMore:start+100<found.length,categories:[...new Set(RewardItems.map(item=>item.category))],bundles:Bundles.map(({id,name,items})=>({id,name,total:items.length}))};
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
        if(!item.grantable)throw new RewardError(400,item.unavailableReason??'Item cannot be granted through inventory');
        if(weapon&&(typeof b.rank!=='number'||!Number.isInteger(b.rank)||b.rank<0||b.rank>item.maxRank!))throw new RewardError(400,`Equipment rank must be a whole number from 0 to ${item.maxRank}`);
        if(!weapon&&b.rank!==undefined)throw new RewardError(400,'Rank applies only to equipment with a verified upgrade limit');
        const max=item.kind==='entitlement'?720:item.unique?1:item.category==='Currency'?10000000:10000;
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
        const finish=(result:Record<string,unknown>)=>{
            tx.insert(onetimejobs).values({jobId:receipt,doneDate:new Date().toISOString()}).run();
            RecordProgressionEvent(tx,{AccountId:request.accountId,Caller:'admin',Route:route,Body:request,Status:200,Reply:result});
            return result;
        };
        if(item?.kind==='entitlement'){
            const existing=tx.select().from(entitlements).where(and(eq(entitlements.accountId,request.accountId),eq(entitlements.name,item.id))).get(),now=Date.now();
            if(existing&&(!Number.isSafeInteger(existing.duration)||existing.duration<0||!Number.isFinite(Date.parse(existing.activatedDate))))throw new RewardError(409,'Boost entitlement needs repair before granting time');
            const active=existing&&!existing.revokedDate&&(existing.duration===0||Date.parse(existing.activatedDate)+existing.duration*3600000>now);
            const permanent=!!active&&existing!.duration===0;
            const before=active&&!permanent?(Date.parse(existing!.activatedDate)+existing!.duration*3600000-now)/3600000:0;
            if(!permanent&&before+(b.quantity as number)>8760)throw new RewardError(409,'Boost would exceed one year of remaining time');
            if(!permanent)GrantEntitlementInTx(tx,request.accountId,item.id,b.quantity as number,`dashboard-reward:${actorId}`);
            const saved=tx.select().from(entitlements).where(and(eq(entitlements.accountId,request.accountId),eq(entitlements.name,item.id))).get()!;
            return finish({requestId:request.requestId,accountId:request.accountId,accountName:owner.name,characterId:request.characterId,characterName:character.name,catalogId:item.id,itemName:item.name,unit:'hours',added:permanent?0:b.quantity,before,after:permanent?0:before+(b.quantity as number),expiresAt:permanent?null:new Date(Date.parse(saved.activatedDate)+saved.duration*3600000).toISOString(),permanent,replayed:false});
        }
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
        return finish(result);
    },{behavior:'immediate'});
}
