const LEGACY_RAMS_IDS = new Set(['rams', 'notes', 'CURRENCY_NOTES']);
const MAX_STACK_QUANTITY = 2147483647;

function ReadStacks(value, characterId){
  let parsed;
  try { parsed = JSON.parse(value ?? '[]'); } catch { throw Error(`Invalid inventory for ${characterId}`); }
  if(!Array.isArray(parsed)) throw Error(`Invalid inventory for ${characterId}`);

  const result = [];
  const byCatalog = new Map();
  for(const item of parsed){
    if(!item || typeof item.catalogId !== 'string' || !Number.isSafeInteger(item.quantity) || item.quantity < 0 || item.quantity > MAX_STACK_QUANTITY){
      throw Error(`Invalid stacked item in inventory for ${characterId}`);
    }
    const catalogId = LEGACY_RAMS_IDS.has(item.catalogId) ? 'CURRENCY_NOTES' : item.catalogId;
    const existing = byCatalog.get(catalogId);
    if(existing){
      existing.quantity += item.quantity;
      if(!Number.isSafeInteger(existing.quantity) || existing.quantity > MAX_STACK_QUANTITY) throw Error(`Invalid Rams balance in inventory for ${characterId}`);
    }
    else{
      const normalized = {...item, catalogId};
      byCatalog.set(catalogId, normalized);
      result.push(normalized);
    }
  }
  return result;
}

function ActiveCharacter(db, userId){
  return db.prepare('SELECT characterId,lastModifiedDate,updateVersion FROM characters WHERE userId=? ORDER BY lastModifiedDate DESC,updateVersion DESC,characterId ASC').get(userId);
}

function ApplyCurrencyMigration(db, userId){
  const inventories = db.prepare('SELECT i.characterId,i.stackedItems FROM inventories i JOIN characters c ON c.characterId=i.characterId WHERE c.userId=?').all(userId);
  const normalized = new Map();
  for(const row of inventories){
    const stacks = ReadStacks(row.stackedItems, row.characterId);
    normalized.set(row.characterId, stacks);
    db.prepare('UPDATE inventories SET stackedItems=? WHERE characterId=?').run(JSON.stringify(stacks), row.characterId);
  }

  const user = db.prepare('SELECT notes FROM users WHERE userId=?').get(userId);
  if(!user || !Number.isSafeInteger(user.notes) || user.notes < 0 || user.notes > MAX_STACK_QUANTITY) throw Error('Invalid Rams balance in imported account');
  if(user.notes === 0) return;

  const active = ActiveCharacter(db, userId);
  if(!active) throw Error('Cannot migrate Rams without a character');
  const stacks = normalized.get(active.characterId) ?? ReadStacks('[]', active.characterId);
  const existing = stacks.find(item => item.catalogId === 'CURRENCY_NOTES');
  if(existing){
    existing.quantity += user.notes;
    if(!Number.isSafeInteger(existing.quantity) || existing.quantity > MAX_STACK_QUANTITY) throw Error('Imported Rams balance is too large');
  }
  else{
    stacks.push({catalogId: 'CURRENCY_NOTES', quantity: user.notes});
  }
  db.prepare('INSERT INTO inventories(characterId,instancedItems,stackedItems) VALUES(?,' + "'[]'" + ',?) ON CONFLICT(characterId) DO UPDATE SET stackedItems=excluded.stackedItems').run(active.characterId, JSON.stringify(stacks));
  db.prepare('UPDATE users SET notes=0 WHERE userId=?').run(userId);
}

module.exports = {ApplyCurrencyMigration};
