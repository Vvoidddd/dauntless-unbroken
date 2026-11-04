const assert=require('node:assert/strict'),path=require('node:path');
const Database=require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
const {drizzle}=require('../../DauntlessUnbrokenMetagame/node_modules/drizzle-orm/better-sqlite3');
const {migrate}=require('../../DauntlessUnbrokenMetagame/node_modules/drizzle-orm/better-sqlite3/migrator');
const {ApplyCurrencyMigration}=require('./migrate-currency.cjs');

function db(){
  const value=new Database(':memory:');
  migrate(drizzle(value),{migrationsFolder:path.resolve(__dirname,'../../DauntlessUnbrokenMetagame/src/drizzle')});
  return value;
}
function seed(value,notes,stackedItems){
  value.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES(?, ?, ?, 0)').run('UID-currency-check','CurrencyCheck',notes);
  value.prepare('INSERT INTO characters(characterId,userId,createdDate,lastModifiedDate,name,updateVersion,data) VALUES(?,?,?,?,?,?,?)').run('char-currency-check','UID-currency-check','2026-01-01','2026-01-02','CurrencyCheck',1,'{}');
  value.prepare('INSERT INTO inventories(characterId,instancedItems,stackedItems) VALUES(?,?,?)').run('char-currency-check','[]',JSON.stringify(stackedItems));
}

const legacyInventory=db();
try{
  seed(legacyInventory,0,[{catalogId:'rams',quantity:200},{catalogId:'CURRENCY_NOTES',quantity:25},{catalogId:'ORB_SHOCK',quantity:2}]);
  ApplyCurrencyMigration(legacyInventory,'UID-currency-check');
  assert.deepEqual(JSON.parse(legacyInventory.prepare('SELECT stackedItems FROM inventories').get().stackedItems),[
    {catalogId:'CURRENCY_NOTES',quantity:225},{catalogId:'ORB_SHOCK',quantity:2}
  ]);
  assert.equal(legacyInventory.prepare('SELECT notes FROM users').get().notes,0);
  ApplyCurrencyMigration(legacyInventory,'UID-currency-check');
  assert.deepEqual(JSON.parse(legacyInventory.prepare('SELECT stackedItems FROM inventories').get().stackedItems),[
    {catalogId:'CURRENCY_NOTES',quantity:225},{catalogId:'ORB_SHOCK',quantity:2}
  ]);
}finally{legacyInventory.close();}

const legacyWallet=db();
try{
  seed(legacyWallet,1500,[]);
  ApplyCurrencyMigration(legacyWallet,'UID-currency-check');
  assert.deepEqual(JSON.parse(legacyWallet.prepare('SELECT stackedItems FROM inventories').get().stackedItems),[
    {catalogId:'CURRENCY_NOTES',quantity:1500}
  ]);
  assert.equal(legacyWallet.prepare('SELECT notes FROM users').get().notes,0);
}finally{legacyWallet.close();}

console.log('Legacy Rams inventory IDs and users.notes balances normalize to one idempotent CURRENCY_NOTES stack.');
