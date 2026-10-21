import {RemoveTestDb} from './setup';
import './authenv';
import './appenv';
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {GetDb} from '../src/db';
import {MakePlayer} from './helpers';
import {PurchaseHistory} from '../src/controllers/purchasehistory';
import {HashUserAPIKey} from '../src/controllers/auth';
import {StartApp,StopApp,Call} from './appclient';
after(()=>RemoveTestDb(()=>GetDb().$client.close()));
test('history is account scoped, groups atomic debits/grants and reports missing delivery without inventing a refund',async()=>{
 const a=await MakePlayer(),b=await MakePlayer(),sql=GetDb().$client;
 const add=sql.prepare('INSERT INTO inventorylog(time,userId,characterId,transactionId,source,caller,operation,catalogId,quantityChange) VALUES(?,?,?,?,?,?,?,?,?)');
 const row=(p:typeof a,tx:string,op:string,id:string,n:number)=>add.run('2026-10-21T00:00:00Z',p.UserId,p.CharacterId,tx,'vendor:granny','gameserver',op,id,n);
 sql.prepare('INSERT INTO inventorylog(time,userId,characterId,transactionId,source,caller,operation,catalogId,instanceId) VALUES(?,?,?,?,?,?,?,?,?)').run('2026-10-21T00:00:00Z',a.UserId,a.CharacterId,'skin','store:armor','store','add','ARMOR_SKIN','owned-instance');
 row(a,'skin','remove','CURRENCY_NOTES',-5000);
 row(a,'same-id','add','TONIC_BLITZ',2);row(a,'same-id','remove','CURRENCY_NOTES',-100);
 row(b,'same-id','add','OTHER_PLAYERS_ITEM',1);row(b,'same-id','remove','CURRENCY_NOTES',-999);
 row(a,'missing','remove','CURRENCY_NOTES',-500);
 row(a,'refund','remove','CURRENCY_NOTES',-50);row(a,'refund','add','CURRENCY_NOTES',50);
 const before=sql.prepare('SELECT COUNT(*) n FROM inventorylog').get();
 const history=PurchaseHistory(a.UserId);assert.equal(history.purchases.length,4);
 assert.equal(history.purchases[0].status,'refunded');assert.equal(history.purchases[1].status,'needs_review');
 assert.deepEqual(history.purchases[2].costs,[{catalogId:'CURRENCY_NOTES',quantity:100}]);
 assert.deepEqual(history.purchases[2].items,[{catalogId:'TONIC_BLITZ',quantity:2}]);
 assert.deepEqual(history.purchases[3].items,[{catalogId:'ARMOR_SKIN',quantity:1}]);assert.equal(history.purchases[3].status,'delivered');
 assert.ok(!JSON.stringify(history).includes('OTHER_PLAYERS_ITEM'));assert.ok(!JSON.stringify(history).includes('transactionId'));
 assert.deepEqual(sql.prepare('SELECT COUNT(*) n FROM inventorylog').get(),before);
 const key='UUK_'+crypto.randomUUID().replace(/-/g,'');sql.prepare('INSERT INTO userapikeys VALUES(?,?)').run(a.UserId,HashUserAPIKey(key));
 await StartApp();
 try{
  assert.equal((await Call('GET','/unbroken/api/PurchaseHistory')).status,401);
  const response=await Call('GET','/unbroken/api/PurchaseHistory?userId='+b.UserId,{headers:{'x-dauntless-unbroken-user-api-key':key}});
  assert.equal(response.status,200);assert.deepEqual(response.json,history);
 }finally{await StopApp();}
});
