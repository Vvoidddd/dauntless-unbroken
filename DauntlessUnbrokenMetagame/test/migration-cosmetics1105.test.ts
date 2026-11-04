import { RemoveTestDb } from './setup';
import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { GetDb } from '../src/db';
import { MakePlayer } from './helpers';
import { GetInventoryForUserIdAndCharacterId } from '../src/controllers/inventory';
import { GetBountyReply, SetBounties } from '../src/controllers/bounties';

after(()=>RemoveTestDb(()=>GetDb().$client.close()));

it('repairs native cosmetic ownership once, retaining legacy evidence, gear and cells',async()=>{
    process.env.BIND_HOST='127.0.0.1';process.env.LOCAL_1105_REALM='1';
    try{
        const {UserId,CharacterId}=await MakePlayer();
        const db=GetDb().$client;
        const gear={catalogId:'WP_SWORD_GNASHER',instanceId:'gear',updateVersion:9,itemData:{upgradeLevel:15}};
        const instances=[gear,{catalogId:'WP_IH_SERRATED',instanceId:'old-skin'},{catalogId:'WP_IH_SERRATED',instanceId:'duplicate-old-skin'}];
        const stacks=[{catalogId:'CELL_CRIT',quantity:7},{catalogId:'NOTES',quantity:1234}];
        db.prepare('INSERT OR REPLACE INTO inventories (characterId,instancedItems,stackedItems) VALUES (?,?,?)').run(CharacterId,JSON.stringify(instances),JSON.stringify(stacks));
        const first=await GetInventoryForUserIdAndCharacterId(UserId,CharacterId);
        assert.equal(first.success,true);
        assert.deepEqual(first.data!.instancedItems,[gear]);
        assert.deepEqual(first.data!.stackedItems,[...stacks,{catalogId:'WP_IH_SERRATED',quantity:1}]);
        const stored=()=>db.prepare('SELECT * FROM inventories WHERE characterId=?').get(CharacterId) as any;
        const before=stored();assert.equal(before.instancedItems,JSON.stringify(instances));
        assert.deepEqual(await GetInventoryForUserIdAndCharacterId(UserId,CharacterId),first);
        assert.deepEqual(stored(),before);
        const other=await MakePlayer();
        assert.equal((await GetInventoryForUserIdAndCharacterId(other.UserId,CharacterId)).success,false);
    }finally{delete process.env.LOCAL_1105_REALM;delete process.env.BIND_HOST;}
});

it('repairs imported cosmetics when the public backend identifies build 365075',async()=>{
    process.env.BIND_HOST='127.0.0.1';process.env.TARGET_CHANGELIST='365075';delete process.env.LOCAL_1105_REALM;
    try{
        const {UserId,CharacterId}=await MakePlayer();
        const db=GetDb().$client;
        const legacy={catalogId:'WP_IH_SERRATED',instanceId:'purchased-skin',updateVersion:0};
        db.prepare('INSERT OR REPLACE INTO inventories (characterId,instancedItems,stackedItems) VALUES (?,?,?)').run(CharacterId,JSON.stringify([legacy]),'[]');
        const result=await GetInventoryForUserIdAndCharacterId(UserId,CharacterId);
        assert.equal(result.success,true);
        assert.deepEqual(result.data!.instancedItems,[]);
        assert.deepEqual(result.data!.stackedItems,[{catalogId:'WP_IH_SERRATED',quantity:1}]);
    }finally{delete process.env.TARGET_CHANGELIST;delete process.env.BIND_HOST;}
});

it('ordinary and seasonal bounties sharing a slot survive reciprocal updates',async()=>{
    process.env.BIND_HOST='127.0.0.1';process.env.LOCAL_1105_REALM='1';
    try{
        const {UserId}=await MakePlayer();
        const save=(id:string,version=0)=>SetBounties(UserId,{bounties:[{bounty_id:id,slot_index:3,update_version:version}]},'gameserver');
        save('Challenge_Season_DamageTotal-season17-0');save('Bounty_Silver_KillAxePike');
        save('Challenge_Season_DamageTotal-season17-0',1);save('Bounty_Silver_KillAxePike',1);
        save('Challenge_Daily_Hunt');
        assert.equal(GetBountyReply(UserId).payload.bounties.length,3);
        save('Bounty_Gold_HuntsSwordTwo');
        assert.deepEqual(GetBountyReply(UserId).payload.bounties.map((b:any)=>b.bounty_id).sort(),
            ['Bounty_Gold_HuntsSwordTwo','Challenge_Daily_Hunt','Challenge_Season_DamageTotal-season17-0'].sort());
    }finally{delete process.env.LOCAL_1105_REALM;delete process.env.BIND_HOST;}
});
