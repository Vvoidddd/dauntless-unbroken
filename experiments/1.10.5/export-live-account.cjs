// Run only through the restricted SSH key on the 1.4.4 host. Never writes its database.
const {DatabaseSync}=require('node:sqlite');
const {createInterface}=require('node:readline');
function reply(value){
 const json=JSON.stringify(value);
 // Windows OpenSSH/PowerShell truncates very long output lines. Keep every
 // compressed line small; the final closing brace marks a complete reply.
 const data=Buffer.from((process.argv.includes('--gzip')?JSON.stringify({gzip:require('node:zlib').gzipSync(json).toString('base64').match(/.{1,4096}/g)},null,1):json)+'\n');
 for(let offset=0;offset<data.length;)offset+=require('node:fs').writeSync(1,data,offset,Math.min(4096,data.length-offset));
}
const userTables='characters userapikeys authepochs loadouts breadcrumbs encounteredcontent loadoutslots discordlinks huntregions'.split(' ');
const accountTables='bounties bountydraft cooldowns entitlements huntpassselection objectives progress_tracks escalationprogression escalationtalents escalationunlocks leaderboardprofiles'.split(' ');
async function main(){
 const input=createInterface({input:process.stdin,crlfDelay:Infinity});let hash='';for await(const line of input){hash=line.trim();input.close();break;}
 if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid account proof');
 const db=new DatabaseSync(process.env.MIGRATION_SOURCE_DB||'C:/DauntlessUnbroken/data/dauntless-unbroken.db',{readOnly:true});
 try{db.exec('PRAGMA busy_timeout=5000; BEGIN');
  const key=db.prepare('SELECT userId,keyHash FROM userapikeys WHERE keyHash=?').get(hash);if(!key){reply({error:'account_not_found'});return;}
  const uid=key.userId,user=db.prepare('SELECT * FROM users WHERE userId=?').get(uid);if(!user)throw Error('Missing account');
  const tables={users:[{...user,isAdmin:0}]};
  for(const t of userTables)tables[t]=db.prepare(`SELECT * FROM ${t} WHERE userId=?`).all(uid);
  for(const t of accountTables)tables[t]=db.prepare(`SELECT * FROM ${t} WHERE accountId=?`).all(uid);
  tables.inventories=db.prepare('SELECT * FROM inventories WHERE characterId IN (SELECT characterId FROM characters WHERE userId=?)').all(uid);
  tables.account_playtime=db.prepare('SELECT * FROM account_playtime WHERE account_id=?').all(uid);
  const social=require('./migration-social.cjs').collect(db,uid);
  db.exec('COMMIT');reply({format:1,source:'live-1.4.4',readOnly:true,userId:uid,exportedAt:new Date().toISOString(),tables,social});
 }finally{db.close();}
}
main().catch(()=>{console.error('Read-only account export failed');process.exitCode=1;});
