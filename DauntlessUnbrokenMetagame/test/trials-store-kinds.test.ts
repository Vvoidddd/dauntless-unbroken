import {RemoveTestDb} from './setup';
import './authenv';
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {eq} from 'drizzle-orm';
import {StartApp,StopApp} from './appclient';
import {WithEnv} from './appenv';
import {GetDb} from '../src/db';
import {inventory} from '../src/db/schema';
import {MakePlayer,StackQuantity} from './helpers';
import {CreateStorePurchase,RedeemStorePurchase,GetStoreOffer} from '../src/controllers/freestore';
import shop from '../src/vendor/store_ladyluck.json';
import catalog from '../src/vendor/admin_grant_catalog.json';
before(StartApp);
after(async()=>{await StopApp();RemoveTestDb(()=>GetDb().$client.close());});
test('Trials shop storage kinds agree with the game item catalog',()=>{
  const kinds=new Map(catalog.items.map(item=>[item.id,item.kind]));
  for(const [id,kind] of Object.entries(shop.itemKinds))if(kinds.has(id))assert.equal(kind,kinds.get(id),id);
});
test('Trials crown is delivered as a cosmetic stack and charged exactly once',async()=>{
  const a=await MakePlayer();
  await WithEnv({TRIALS_STORE:'1'},()=>{
    GetDb().insert(inventory).values({characterId:a.CharacterId,instancedItems:'[]',stackedItems:JSON.stringify([{catalogId:'CURRENCY_MARKS_GILDED',quantity:500}])}).run();
    const token=CreateStorePurchase(a.UserId,'marksgilded','ladyluck_headbling_normal').purchaseToken;
    RedeemStorePurchase(a.UserId,'marksgilded',token);
    RedeemStorePurchase(a.UserId,'marksgilded',token);
    assert.equal(StackQuantity(a.CharacterId,'CURRENCY_MARKS_GILDED'),0);
    assert.equal(StackQuantity(a.CharacterId,'AC_HEAD_TRIALS_00'),1);
    const row=GetDb().select().from(inventory).where(eq(inventory.characterId,a.CharacterId)).get()!;
    assert.equal(JSON.parse(row.instancedItems).length,0);
    assert.equal(GetStoreOffer(a.UserId,'ladyluck_headbling_normal').remaining,0);
  });
});
