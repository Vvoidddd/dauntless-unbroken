const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {repair}=require('./repair-trials-store-kinds.cjs');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE characters(characterId TEXT PRIMARY KEY,userId TEXT);
CREATE TABLE inventories(characterId TEXT PRIMARY KEY,instancedItems TEXT,stackedItems TEXT);
CREATE TABLE inventorylog(time TEXT,userId TEXT,characterId TEXT,transactionId TEXT,source TEXT,caller TEXT,operation TEXT,catalogId TEXT,instanceId TEXT,quantityChange INTEGER,quantityAfter INTEGER,updateVersion INTEGER);`);
for(const [id,instances,stacks] of [
 ['missing',[{catalogId:'AC_HEAD_TRIALS_00',instanceId:'crown',updateVersion:0}],[{catalogId:'CURRENCY_MARKS_GILDED',quantity:42},{catalogId:'LT_TRIALS_00',quantity:1}]],
 ['owned',[{catalogId:'AC_HEAD_TRIALS_01',instanceId:'gold'}],[{catalogId:'AC_HEAD_TRIALS_01',quantity:1}]],
 ['unaffected',[],[{catalogId:'CURRENCY_MARKS_GILDED',quantity:500}]],
]){db.prepare('INSERT INTO characters VALUES(?,?)').run(id,id);db.prepare('INSERT INTO inventories VALUES(?,?,?)').run(id,JSON.stringify(instances),JSON.stringify(stacks));}
assert.equal(repair(db).characters,2);
assert.equal(db.prepare('SELECT count(*) n FROM inventorylog').get().n,0);
assert.deepEqual(repair(db,true),{apply:true,characters:2,removedWrongEntries:3,restoredItems:2});
const saved=db.prepare('SELECT * FROM inventories WHERE characterId=?').get('missing');
assert.deepEqual(JSON.parse(saved.stackedItems),[{catalogId:'CURRENCY_MARKS_GILDED',quantity:42},{catalogId:'AC_HEAD_TRIALS_00',quantity:1}]);
assert.equal(JSON.parse(saved.instancedItems)[0].catalogId,'LT_TRIALS_00');
assert.equal(JSON.parse(db.prepare('SELECT stackedItems FROM inventories WHERE characterId=?').get('owned').stackedItems)[0].quantity,1);
assert.equal(repair(db,true).characters,0);
assert.equal(db.prepare('SELECT count(*) n FROM inventorylog').get().n,5);
db.prepare('UPDATE inventories SET instancedItems=?,stackedItems=? WHERE characterId=?').run('[{"catalogId":"AC_HEAD_TRIALS_00","instanceId":"bad"}]','{}','missing');
assert.throws(()=>repair(db,true),/arrays/);
db.close();console.log('Trials storage repair: preview, conversion, existing ownership, currency preservation, audit, retry and invalid-data rollback passed');
