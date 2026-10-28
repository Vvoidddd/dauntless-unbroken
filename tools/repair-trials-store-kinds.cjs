// Convert only seven known misclassified Trials items; never grant unowned items.
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const STACKED = new Set(['AC_HEAD_TRIALS_00','AC_HEAD_TRIALS_01','DYE_GRAY02_DURABLE','DYE_GRAY01_DURABLE','DYE_HP08B_PUNK_02_DURABLE','DYE_HP11B_ENGINEER_00_DURABLE']);
const LANTERN = 'LT_TRIALS_00';
const SOURCE = 'trials-storage-kind-repair-20261028';

function plan(characterId, instances, stacks) {
  if (!Array.isArray(instances) || !Array.isArray(stacks)) throw new Error('Inventory collections must be arrays');
  const removedInstances = instances.filter(i => i && STACKED.has(i.catalogId));
  const removedStacks = stacks.filter(i => i?.catalogId === LANTERN && Number.isSafeInteger(i.quantity) && i.quantity > 0);
  const addedStacks = [...new Set(removedInstances.map(i => i.catalogId))]
    .filter(id => !stacks.some(i => i?.catalogId === id && Number.isSafeInteger(i.quantity) && i.quantity > 0))
    .map(catalogId => ({catalogId,quantity:1}));
  const addedInstances = removedStacks.length && !instances.some(i => i?.catalogId === LANTERN)
    ? [{catalogId:LANTERN,instanceId:createHash('sha256').update(`${SOURCE}:${characterId}:${LANTERN}`).digest('hex').slice(0,32),updateVersion:0,itemData:null}] : [];
  if (!removedInstances.length && !removedStacks.length) return null;
  return {
    instances:[...instances.filter(i => !removedInstances.includes(i)),...addedInstances],
    stacks:[...stacks.filter(i => !removedStacks.includes(i) && !addedStacks.some(a => a.catalogId === i?.catalogId)),...addedStacks],
    changes:[...removedInstances.map(i=>({item:i,operation:'remove',delta:-1})),
      ...removedStacks.map(i=>({item:i,operation:'remove',delta:-i.quantity})),
      ...addedInstances.map(i=>({item:i,operation:'add',delta:1})),
      ...addedStacks.map(i=>({item:i,operation:'add',delta:1}))],
  };
}

function repair(db, apply = false) {
  const result={apply,characters:0,removedWrongEntries:0,restoredItems:0};
  const ids=[...STACKED,LANTERN];
  const where=ids.map((id,i)=>`${i===ids.length-1?'i.stackedItems':'i.instancedItems'} LIKE ?`).join(' OR ');
  if(apply) db.exec('BEGIN IMMEDIATE');
  try {
    const rows=db.prepare(`SELECT i.*,c.userId FROM inventories i JOIN characters c ON c.characterId=i.characterId WHERE ${where}`).all(...ids.map(id=>`%"${id}"%`));
    const update=apply?db.prepare('UPDATE inventories SET instancedItems=?,stackedItems=? WHERE characterId=?'):null;
    const log=apply?db.prepare('INSERT INTO inventorylog(time,userId,characterId,transactionId,source,caller,operation,catalogId,instanceId,quantityChange,quantityAfter,updateVersion) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)'):null;
    for(const row of rows) {
      const p=plan(row.characterId,JSON.parse(row.instancedItems),JSON.parse(row.stackedItems));
      if(!p)continue;
      result.characters++;
      for(const change of p.changes)change.operation==='add'?result.restoredItems++:result.removedWrongEntries++;
      if(!apply)continue;
      update.run(JSON.stringify(p.instances),JSON.stringify(p.stacks),row.characterId);
      for(const {item,operation,delta} of p.changes)log.run(new Date().toISOString(),row.userId,row.characterId,SOURCE,SOURCE,'admin',operation,item.catalogId,item.instanceId??null,delta,item.instanceId?null:operation==='remove'?0:item.quantity,item.updateVersion??null);
    }
    if(apply)db.exec('COMMIT');
    return result;
  }catch(error){if(apply)db.exec('ROLLBACK');throw error;}
}
module.exports={plan,repair};
if(require.main===module){
  const file=process.argv[2],apply=process.argv[3]==='--apply';
  if(!file || process.argv.length>4 || (process.argv[3] && !apply))throw new Error('Usage: node repair-trials-store-kinds.cjs <database> [--apply]');
  const db=new DatabaseSync(file,{readOnly:!apply});
  try{db.exec('PRAGMA busy_timeout=5000');console.log(JSON.stringify(repair(db,apply)));}finally{db.close();}
}
