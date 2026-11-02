// Run once with 1.4.4 writes stopped. Never copy bare users/keys: login imports the complete save.
const tables={invitecodes:['inviteCode'],discord_invites:['discordId'],account_bans:['account_id'],discord_moderation:['discordId'],account_device_signals:['account_id','kind'],device_ban_signals:['account_id','kind']};
function exportControls(db){
 if(db.pragma('quick_check',{simple:true})!=='ok')throw Error('Source database failed integrity check');
 return {format:1,tables:Object.fromEntries(Object.keys(tables).map(t=>[t,db.prepare(`SELECT * FROM ${t}`).all()]))};
}
function merge(db,data){
 if(data.format!==1||!data.tables||JSON.stringify(Object.keys(data.tables).sort())!==JSON.stringify(Object.keys(tables).sort()))throw Error('Unexpected controls export');
 const counts={};
 db.transaction(()=>{
  for(const [table,keys] of Object.entries(tables)){
   const columns=db.pragma(`table_info(${table})`).map(x=>x.name);
   const rows=data.tables[table];if(!Array.isArray(rows))throw Error('Invalid table rows');
   const get=db.prepare(`SELECT * FROM ${table} WHERE ${keys.map(k=>`"${k}"=?`).join(' AND ')}`);
   const put=db.prepare(`INSERT INTO ${table} (${columns.map(k=>`"${k}"`).join(',')}) VALUES (${columns.map(()=>'?').join(',')}) ON CONFLICT (${keys.map(k=>`"${k}"`).join(',')}) DO UPDATE SET ${columns.filter(k=>!keys.includes(k)).map(k=>`"${k}"=excluded."${k}"`).join(',')}`);
   counts[table]=0;
   for(const source of rows){
    if(Object.keys(source).some(k=>!columns.includes(k))||columns.some(k=>!(k in source)))throw Error(`Schema mismatch: ${table}`);
    const row={...source},old=get.get(...keys.map(k=>row[k]));
    if(table==='discord_invites'){
     if(old&&old.inviteCode!==row.inviteCode)throw Error('Conflicting Discord invite ownership');
     const owner=db.prepare('SELECT discordId FROM discord_invites WHERE inviteCode=?').get(row.inviteCode);
     if(owner&&owner.discordId!==row.discordId)throw Error('Invite belongs to another Discord account');
    }
    if(old){
     if(table==='invitecodes'){
      const remaining=Math.min(old.infiniteUses?Number.MAX_SAFE_INTEGER:old.usesRemaining,row.infiniteUses?Number.MAX_SAFE_INTEGER:row.usesRemaining);
      row.infiniteUses=old.infiniteUses&&row.infiniteUses?1:0;
      if(!row.infiniteUses)row.usesRemaining=remaining;
     }else{
      const time=table==='account_bans'?'updated_at':table==='discord_moderation'?'updatedAt':table==='account_device_signals'?'observed_at':null;
      if(time&&old[time]>row[time])continue;
     }
    }
    put.run(...columns.map(k=>row[k]));counts[table]++;
   }
  }
  if(db.pragma('foreign_key_check').length)throw Error('Foreign key check failed');
 })();
 if(db.pragma('quick_check',{simple:true})!=='ok')throw Error('Destination database failed integrity check');
 return counts;
}
module.exports={exportControls,merge};
if(require.main===module){
 const fs=require('node:fs'),Database=require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
 const [mode,database,file]=process.argv.slice(2);if(!['export','merge'].includes(mode)||!database||!file)throw Error('Usage: export|merge database file');
 const db=new Database(database,{fileMustExist:true,readonly:mode==='export',timeout:5000});
 try{if(mode==='export'){fs.writeFileSync(file,JSON.stringify(exportControls(db)),{flag:'wx'});console.log('Controls exported');}else console.log(JSON.stringify(merge(db,JSON.parse(fs.readFileSync(file,'utf8')))));}finally{db.close();}
}
