import {RemoveTestDb} from './setup';
import './authenv';
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {GetDb} from '../src/db';
import {inventory} from '../src/db/schema';
import {CreateStorePurchase, GetStoreOffer, ListStoreOffers, RedeemStorePurchase, StoreOffer} from '../src/controllers/freestore';
import {RECRUIT_DYE_SKU, ShopLayout} from '../src/controllers/shoplayout';
import catalog from '../src/vendor/store_catalog.json';
import {MakePlayer, StackQuantity} from './helpers';
import {WithEnv} from './appenv';

after(()=>RemoveTestDb(()=>GetDb().$client.close()));

test('Recruit dyes stay free and claimable across rotations, including with all dyes already owned',()=>WithEnv({
    STORE:'free', STORE_RAMS:'1', STORE_WEEKLY_ROTATION:'1', STORE_REPEATABLE_TOKENS:'0'
},async()=>{
    const marker='TOKEN_STORE_TUTORIAL_DYE_BUNDLE';
    const first=await MakePlayer();
    for(const profile of [undefined,'curated30']) await WithEnv({STORE_CATALOG_PROFILE:profile},async()=>{
        for(const seed of ['', 'refresh', 'another-refresh']) await WithEnv({STORE_ROTATION_SEED:seed},()=>{
            for(let week=0;week<104;week++){
                const stock=ShopLayout(catalog.webstore as StoreOffer[],first.UserId,new Date(Date.UTC(2026,0,1+week*7)));
                const offers=stock.filter(o=>o.id===RECRUIT_DYE_SKU);
                assert.equal(offers.length,1);
                assert.equal(offers[0].availableFrom,null);
                assert.equal(offers[0].availableTo,null);
            }
        });
        const listed=ListStoreOffers(first.UserId,'webstore').filter(o=>o.id===RECRUIT_DYE_SKU);
        assert.equal(listed.length,1);
        for(const tag of ['dye_armour','supplies_supplies']) assert.ok(listed[0].tags.includes(tag));
        assert.equal(GetStoreOffer(first.UserId,RECRUIT_DYE_SKU).platinumPrice,0);
        assert.equal(GetStoreOffer(first.UserId,RECRUIT_DYE_SKU).notesPrice,undefined);
    });

    const offer=GetStoreOffer(first.UserId,RECRUIT_DYE_SKU);
    const claim=(uid:string)=>{
        const token=CreateStorePurchase(uid,'platinum',RECRUIT_DYE_SKU).purchaseToken;
        RedeemStorePurchase(uid,'platinum',token);
        RedeemStorePurchase(uid,'platinum',token); // Retry must not duplicate the receipt or dyes.
    };
    claim(first.UserId);
    for(const item of offer.items!) assert.equal(StackQuantity(first.CharacterId,item.catalogId),1);
    assert.equal(GetStoreOffer(first.UserId,RECRUIT_DYE_SKU).remaining,0);

    const second=await MakePlayer();
    GetDb().insert(inventory).values({characterId:second.CharacterId,instancedItems:'[]',stackedItems:JSON.stringify(
        offer.items!.filter(i=>i.catalogId!==marker).map(i=>({...i,quantity:1}))
    )}).run();
    assert.equal(GetStoreOffer(second.UserId,RECRUIT_DYE_SKU).remaining,1);
    claim(second.UserId);
    for(const item of offer.items!) assert.equal(StackQuantity(second.CharacterId,item.catalogId),1);
}));
