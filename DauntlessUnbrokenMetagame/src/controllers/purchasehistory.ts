import {GetDb} from '../db';

type Change={id:number;time:string;characterId:string;transactionId:string;source:string|null;operation:string;catalogId:string|null;instanceId:string|null;quantityChange:number|null};
export function PurchaseHistory(userId:string){
 const db=GetDb().$client;
 // The debit and grant share both character and transaction identities. Never expose tokens/keys.
 const debits=db.prepare(`SELECT id,time,characterId,transactionId,source FROM inventorylog
  WHERE userId=? AND operation='remove' AND quantityChange<0 AND catalogId LIKE 'CURRENCY_%'
   AND transactionId IS NOT NULL AND caller IN ('store','gameserver') ORDER BY id DESC LIMIT 150`).all(userId) as Change[];
 const seen=new Set<string>(),purchases=[];
 const rows=db.prepare(`SELECT operation,catalogId,instanceId,quantityChange FROM inventorylog
  WHERE userId=? AND characterId=? AND transactionId=? ORDER BY id LIMIT 1000`);
 for(const debit of debits){
  const identity=JSON.stringify([debit.characterId,debit.transactionId]);if(seen.has(identity))continue;seen.add(identity);
  const changes=rows.all(userId,debit.characterId,debit.transactionId) as Change[];
  const totals=(operation:string,currency:boolean)=>{
   const quantities=new Map<string,number>();
   for(const row of changes){
    if(row.operation!==operation||!row.catalogId||row.catalogId.startsWith('CURRENCY_')!==currency)continue;
    const quantity=Math.abs(row.quantityChange??(row.instanceId?1:0));
    if(quantity>0)quantities.set(row.catalogId,(quantities.get(row.catalogId)??0)+quantity);
   }
   return [...quantities].slice(0,100).map(([catalogId,quantity])=>({catalogId,quantity}));
  };
  const costs=totals('remove',true),items=[...totals('add',false),...totals('save',false)].slice(0,100),returns=totals('add',true);
  const refunded=costs.length>0&&costs.every(c=>returns.some(r=>r.catalogId===c.catalogId&&r.quantity>=c.quantity));
  purchases.push({id:String(debit.id),time:debit.time,source:debit.source?.slice(0,160)??'',costs,items,
   status:refunded?'refunded':items.length>0?'delivered':'needs_review'});
  if(purchases.length===50)break;
 }
 return {purchases,limit:50};
}
