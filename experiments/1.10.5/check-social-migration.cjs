const assert=require('node:assert/strict'),path=require('node:path');
const Database=require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
const {drizzle}=require('../../DauntlessUnbrokenMetagame/node_modules/drizzle-orm/better-sqlite3');
const {migrate}=require('../../DauntlessUnbrokenMetagame/node_modules/drizzle-orm/better-sqlite3/migrator');
const social=require('./migration-social.cjs'),{prepare,admit,hashKey}=require('./migrate-on-login.cjs');
const source=new Database(':memory:'),target=new Database(':memory:');
const ids=[1,2].map(n=>`UID-${String(n).repeat(8)}-1111-4111-8111-111111111111`),keys=['a','b'].map(c=>'UUK-'+c.repeat(64)),date=new Date().toISOString();
const insert=(db,t,row)=>db.prepare(`INSERT INTO ${t} (${Object.keys(row)}) VALUES (${Object.keys(row).map(()=>'?')})`).run(...Object.values(row));
try{
 for(const db of [source,target])migrate(drizzle(db),{migrationsFolder:path.resolve(__dirname,'../../DauntlessUnbrokenMetagame/src/drizzle')});prepare(target);
 for(const [n,uid] of ids.entries()){
  insert(source,'users',{userId:uid,name:'Peer'+n,notes:0,isAdmin:1});
  insert(source,'userapikeys',{userId:uid,keyHash:hashKey(keys[n])});
  insert(source,'characters',{characterId:'char'+n,userId:uid,name:'Peer'+n,createdDate:date,lastModifiedDate:date,updateVersion:0,data:'{}'});
  insert(source,'inventories',{characterId:'char'+n,instancedItems:'[]',stackedItems:'[]'});
 }
 insert(source,'friendships',{userLow:ids[0],userHigh:ids[1],requesterId:ids[0],status:'ACCEPTED',createdAt:1,updatedAt:1});
 insert(source,'guilds',{guildId:'guild1',name:'Test guild',nameKey:'test guild',nameplate:'TG',nameplateKey:'tg',leaderId:ids[0],createdAt:1,updatedAt:1});
 for(const [n,uid] of ids.entries())insert(source,'guildmembers',{accountId:uid,guildId:'guild1',rank:n?'Member':'Leader',joinedAt:1,updatedAt:1});
 insert(source,'slayerlinks',{linkId:'link1',senderId:ids[0],targetId:ids[1],senderSlot:0,targetSlot:0,createdAt:1,endsAt:2});
 insert(source,'slayerlinkstate',{linkId:'link1',progress:1234,senderConfirmedRank:1,targetConfirmedRank:1});
 for(const [n,uid] of ids.entries())insert(source,'slayerlinkpools',{linkId:'link1',userId:uid,pool:'[]',poolHash:'same-pool',createdAt:1,servedAt:1,claimTransactionId:n?null:'claimed-on-live',claimCharacterId:n?null:'char0',claimedRewards:n?null:'[]',claimedAt:n?null:2});
 insert(source,'slayerlinkxp',{eventId:'event1',linkId:'link1',sourceUserId:ids[0],amount:1234,createdAt:1});
 const snapshot=n=>{
  const tables=Object.fromEntries('users characters userapikeys authepochs loadouts breadcrumbs encounteredcontent loadoutslots discordlinks huntregions bounties bountydraft cooldowns entitlements huntpassselection objectives progress_tracks escalationprogression escalationtalents escalationunlocks leaderboardprofiles inventories account_playtime'.split(' ').map(t=>[t,[]]));
  for(const t of ['users','userapikeys','characters'])tables[t]=source.prepare(`SELECT * FROM ${t} WHERE userId=?`).all(ids[n]);
  tables.inventories=source.prepare('SELECT * FROM inventories WHERE characterId=?').all('char'+n);
  return {format:1,source:'live-1.4.4',readOnly:true,userId:ids[n],exportedAt:date,tables,social:social.collect(source,ids[n])};
 };
 target.exec("INSERT INTO invitecodes VALUES('FIRST',1,0),('SECOND',1,0)");
 const first=snapshot(0),bad=structuredClone(first);bad.social.tables.slayerlinkpools[0].userId='unknown';
 assert.throws(()=>admit(target,hashKey(keys[0]),'FIRST',bad),/social peer/);
 assert.equal(target.prepare('SELECT count(*) n FROM users').get().n,0);
 admit(target,hashKey(keys[0]),'FIRST',first);
 assert.equal(target.prepare('SELECT count(*) n FROM userapikeys').get().n,1);
 assert.equal(target.prepare('SELECT isAdmin FROM users WHERE userId=?').get(ids[1]).isAdmin,0);
 assert.equal(target.prepare('SELECT count(*) n FROM guildmembers').get().n,2);
 assert.equal(target.prepare('SELECT progress FROM slayerlinkstate').get().progress,1234);
 assert.equal(target.prepare('SELECT claimTransactionId FROM slayerlinkpools WHERE userId=?').get(ids[0]).claimTransactionId,'claimed-on-live');
 target.exec('DELETE FROM friendships; UPDATE slayerlinkstate SET progress=2345');
 // Late migration must upgrade a stub and retain test changes; live claims must stay claimed.
 source.prepare("UPDATE slayerlinkpools SET claimTransactionId='late-claim',claimCharacterId='char1',claimedRewards='[]',claimedAt=3 WHERE userId=?").run(ids[1]);
 admit(target,hashKey(keys[1]),'SECOND',snapshot(1));
 assert.equal(target.prepare('SELECT count(*) n FROM userapikeys').get().n,2);
 assert.equal(target.prepare('SELECT count(*) n FROM social1105_stubs').get().n,0);
 assert.equal(target.prepare('SELECT count(*) n FROM friendships').get().n,0);
 assert.equal(target.prepare('SELECT progress FROM slayerlinkstate').get().progress,2345);
 assert.equal(target.prepare('SELECT claimedAt FROM slayerlinkpools WHERE userId=?').get(ids[1]).claimedAt,3);
 assert.equal(target.prepare('SELECT count(*) n FROM migration1105_merits').get().n,2);
 assert.equal(target.pragma('integrity_check',{simple:true}),'ok');
 console.log('Social migration passed: rollback, credential-free peers, stub admission, guild roster, Slayer Link progress/claims, late claims and no resurrection.');
}finally{source.close();target.close();}
