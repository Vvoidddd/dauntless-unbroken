// Run on the hosted test VPS. The live endpoint is read-only and requires key proof.
const fs=require('node:fs'),path=require('node:path');
const Database=require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
const migration=require('./migrate-on-login.cjs');
async function main(){
 const state=path.resolve(__dirname,'../../../backend-state'),config=JSON.parse(fs.readFileSync(path.join(state,'hosted.json'))),apply=process.argv.includes('--apply');
 if(config.host!=='82.153.118.185'||!config.migration)throw Error('Expected the isolated hosted 1.10.5 realm');
 const db=new Database(path.join(state,'realm.db'),{fileMustExist:true,readonly:!apply,timeout:5000});
 try{
  if(apply){const backup=path.join(state,'realm-before-social-merits.db');if(!fs.existsSync(backup))await db.backup(backup);migration.prepare(db);}
  const accounts=db.prepare('SELECT u.userId,u.name,k.keyHash FROM users u JOIN userapikeys k ON k.userId=u.userId WHERE u.isAdmin=0').all();
  for(const account of accounts){
   if(apply&&db.prepare('SELECT 1 FROM social1105_accounts WHERE userId=?').get(account.userId)){console.log(JSON.stringify({name:account.name,status:'already migrated'}));continue;}
   let ex;try{ex=await migration.exportRemote(config.migration,account.keyHash);}catch(e){if(e.message.includes('not found on the live')){console.log(JSON.stringify({name:account.name,status:'new test account; no grant'}));continue;}throw e;}
   if(apply)migration.completeExisting(db,account.keyHash,ex);
   console.log(JSON.stringify({name:account.name,status:apply?'migrated social data and granted merits':'eligible',friends:ex.social.tables.friendships.length,links:ex.social.tables.slayerlinks.length,guilds:ex.social.tables.guilds.length}));
  }
  if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('Test database integrity check failed');
 }finally{db.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
