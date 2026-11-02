const MERITS='CURRENCY_PJM_WEAPON';
function prepare(db){db.exec('CREATE TABLE IF NOT EXISTS migration1105_merits(characterId TEXT PRIMARY KEY,userId TEXT NOT NULL,amount INTEGER NOT NULL,grantedAt TEXT NOT NULL)');}
function grant(db,uid){
 for(const character of db.prepare('SELECT characterId FROM characters WHERE userId=?').all(uid)){
  const id=character.characterId;
  if(db.prepare('SELECT 1 FROM migration1105_merits WHERE characterId=?').get(id))continue;
  const inventory=db.prepare('SELECT stackedItems FROM inventories WHERE characterId=?').get(id);
  if(!inventory)throw Error('Migrated inventory is missing');
  const items=JSON.parse(inventory.stackedItems);if(!Array.isArray(items))throw Error('Invalid migrated inventory');
  const matches=items.filter(i=>i.catalogId===MERITS);if(matches.length>1)throw Error('Duplicate Combat Merits stack');
  if(matches.length){const current=Number(matches[0].quantity);if(!Number.isSafeInteger(current)||current<0||current>2147483647-200)throw Error('Invalid Combat Merits balance');matches[0].quantity=current+200;}
  else items.push({catalogId:MERITS,quantity:200});
  db.prepare('UPDATE inventories SET stackedItems=? WHERE characterId=?').run(JSON.stringify(items),id);
  db.prepare('INSERT INTO migration1105_merits VALUES(?,?,200,?)').run(id,uid,new Date().toISOString());
 }
}
module.exports={MERITS,prepare,grant};
