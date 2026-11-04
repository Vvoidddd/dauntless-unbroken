const assert=require('node:assert/strict'),path=require('node:path');
const Database=require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
const {drizzle}=require('../../DauntlessUnbrokenMetagame/node_modules/drizzle-orm/better-sqlite3');
const {migrate}=require('../../DauntlessUnbrokenMetagame/node_modules/drizzle-orm/better-sqlite3/migrator');
const {createLogin,hashKey,prepare,completeExisting}=require('./migrate-on-login.cjs');
async function main(){
 const db=new Database(':memory:');migrate(drizzle(db),{migrationsFolder:path.resolve(__dirname,'../../DauntlessUnbrokenMetagame/src/drizzle')});
 const uid='UID-11111111-1111-4111-8111-111111111111',key='UUK-'+ 'a'.repeat(64),date=new Date().toISOString(),characterId='22222222-2222-4222-8222-222222222222';
 const tables=Object.fromEntries('users characters userapikeys authepochs loadouts breadcrumbs encounteredcontent loadoutslots discordlinks huntregions bounties bountydraft cooldowns entitlements huntpassselection objectives progress_tracks escalationprogression escalationtalents escalationunlocks leaderboardprofiles inventories account_playtime'.split(' ').map(t=>[t,[]]));
 tables.users=[{userId:uid,name:'MigrationCheck',notes:0,isAdmin:1}];tables.userapikeys=[{userId:uid,keyHash:hashKey(key)}];
 tables.characters=[{characterId,userId:uid,name:'MigrationCheck',createdDate:date,lastModifiedDate:date,updateVersion:10,data:JSON.stringify({quests:{current:'KeepQuest'},islands:['KeepIsland']})}];
 const emptyCharacter='33333333-3333-4333-8333-333333333333';
 tables.characters.push({...tables.characters[0],characterId:emptyCharacter,name:'NeverPlayed'});
 tables.inventories=[{characterId,instancedItems:'[{"id":"keep-weapon"}]',stackedItems:'[{"catalogId":"rams","quantity":200},{"catalogId":"CURRENCY_PJM_WEAPON","quantity":17}]'}];
 const original=JSON.stringify({format:1,source:'live-1.4.4',readOnly:true,userId:uid,exportedAt:date,tables,social:{peers:[],tables:Object.fromEntries('friendships blocks guilds guildmembers guildinvites slayerlinkinvites slayerlinks slayerlinkstate slayerlinkpools slayerlinkxp'.split(' ').map(t=>[t,[]]))}});
 let calls=0,mode='good';const login=createLogin(db,{},async()=>{calls++;await new Promise(r=>setTimeout(r,10));if(mode==='fail')throw Error('Offline');const ex=JSON.parse(original);if(mode==='bad')ex.tables.inventories[0].characterId='foreign';return ex;});
 try{
  await assert.rejects(login(key,''),/invite/);assert.equal(calls,0);
  db.prepare('INSERT INTO invitecodes VALUES(?,1,0)').run('TEST-ONCE');
  mode='fail';await assert.rejects(login(key,'TEST-ONCE'),/Offline/);assert.equal(db.prepare('SELECT usesRemaining n FROM invitecodes').get().n,1);
  mode='bad';await assert.rejects(login(key,'TEST-ONCE'),/another account/);assert.equal(db.prepare('SELECT count(*) n FROM users').get().n,0);
  mode='good';const before=calls;const results=await Promise.all([login(key,'TEST-ONCE'),login(key,'TEST-ONCE')]);assert.ok(results.every(r=>r.UserId===uid));assert.equal(calls,before+1);
  assert.equal(db.prepare('SELECT usesRemaining n FROM invitecodes').get().n,0);assert.equal(db.prepare('SELECT isAdmin n FROM users').get().n,0);
  assert.equal(db.prepare('SELECT data FROM characters').get().data,tables.characters[0].data);assert.equal(db.prepare('SELECT instancedItems FROM inventories').get().instancedItems,tables.inventories[0].instancedItems);assert.deepEqual(JSON.parse(db.prepare('SELECT stackedItems FROM inventories').get().stackedItems),[{catalogId:'CURRENCY_NOTES',quantity:200},{catalogId:'CURRENCY_PJM_WEAPON',quantity:217}]);
  const emptyInventory=db.prepare('SELECT * FROM inventories WHERE characterId=?').get(emptyCharacter);
  assert.equal(emptyInventory.instancedItems,'[]');assert.deepEqual(JSON.parse(emptyInventory.stackedItems),[{catalogId:'CURRENCY_PJM_WEAPON',quantity:200}]);
  const tracks=db.prepare("SELECT * FROM progress_tracks WHERE progressionId LIKE 'ExperienceTrack_Weapon_%'").all();assert.equal(tracks.length,7);assert.ok(tracks.every(r=>r.progress===0&&r.confirmedFreeRank===1));
  db.prepare('UPDATE characters SET data=?').run('new-test-progress');await login(key,'');assert.equal(db.prepare('SELECT data FROM characters').get().data,'new-test-progress');assert.equal(calls,before+1);
  const snapshot=JSON.parse(original);db.prepare('UPDATE users SET notes=500 WHERE userId=?').run(uid);completeExisting(db,hashKey(key),snapshot);completeExisting(db,hashKey(key),snapshot);
  assert.deepEqual(JSON.parse(db.prepare('SELECT stackedItems FROM inventories').get().stackedItems),[{catalogId:'CURRENCY_NOTES',quantity:700},{catalogId:'CURRENCY_PJM_WEAPON',quantity:217}]);
  assert.equal(db.prepare('SELECT notes FROM users WHERE userId=?').get(uid).notes,0);
  assert.equal(JSON.parse(db.prepare('SELECT stackedItems FROM inventories WHERE characterId=?').get(emptyCharacter).stackedItems)[0].quantity,200);
  db.prepare("DELETE FROM progress_tracks WHERE progressionId LIKE 'ExperienceTrack_Weapon_%'").run();
  completeExisting(db,hashKey(key),snapshot);
  assert.equal(db.prepare("SELECT count(*) n FROM progress_tracks WHERE progressionId LIKE 'ExperienceTrack_Weapon_%'").get().n,7);
  assert.equal(db.prepare('SELECT count(*) n FROM imports1105').get().n,1);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  console.log('Invite admission, source failure, foreign-row rollback, duplicate requests, non-admin import, zero weapon XP, inventory/quest preservation and no overwrite passed.');
 }finally{db.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
