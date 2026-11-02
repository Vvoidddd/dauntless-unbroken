// On the hosted test realm: pipe a live account key HASH, never the UUK key.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const Database=require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
const {drizzle}=require('../../DauntlessUnbrokenMetagame/node_modules/drizzle-orm/better-sqlite3');
const {migrate}=require('../../DauntlessUnbrokenMetagame/node_modules/drizzle-orm/better-sqlite3/migrator');
const migration=require('./migrate-on-login.cjs');
(async()=>{
 const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../backend-state/hosted.json')));
 const hash=fs.readFileSync(0,'utf8').trim(),at=Date.now();
 const ex=await migration.exportRemote(config.migration,hash);
 const db=new Database(':memory:');
 try{
  migrate(drizzle(db),{migrationsFolder:path.resolve(__dirname,'../../DauntlessUnbrokenMetagame/src/drizzle')});migration.prepare(db);
  db.prepare('INSERT INTO invitecodes VALUES(?,1,0)').run('TRANSFER-CHECK');
  const result=migration.admit(db,hash,'TRANSFER-CHECK',ex);
  assert.equal(result.imported,true);assert.equal(result.UserId,ex.userId);
  assert.equal(db.prepare('SELECT usesRemaining n FROM invitecodes').get().n,0);
  assert.equal(migration.admit(db,hash,'TRANSFER-CHECK',ex).imported,false);
  assert.equal(db.prepare('SELECT count(*) n FROM characters WHERE userId=?').get(ex.userId).n,ex.tables.characters.length);
  for(const inventory of ex.tables.inventories){assert.equal(db.prepare('SELECT instancedItems FROM inventories WHERE characterId=?').get(inventory.characterId).instancedItems,inventory.instancedItems);}
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  console.log(JSON.stringify({name:result.Username,bytes:JSON.stringify(ex).length,ms:Date.now()-at,characters:ex.tables.characters.length,status:'complete transfer and fresh import passed in memory; hosted account untouched'}));
 }finally{db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
