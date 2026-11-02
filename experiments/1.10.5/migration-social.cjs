// Social snapshots contain public peer identities, never their credentials or saves.
const tables='friendships blocks guilds guildmembers guildinvites slayerlinkinvites slayerlinks slayerlinkstate slayerlinkpools slayerlinkxp'.split(' ');
function collect(db,uid){
 const query=(sql,...args)=>db.prepare(sql).all(...args),data={};
 data.friendships=query('SELECT * FROM friendships WHERE userLow=? OR userHigh=?',uid,uid);
 data.blocks=query('SELECT * FROM blocks WHERE blockerId=? OR blockedId=?',uid,uid);
 data.guilds=query('SELECT * FROM guilds WHERE guildId IN (SELECT guildId FROM guildmembers WHERE accountId=? UNION SELECT guildId FROM guildinvites WHERE inviteeId=?)',uid,uid);
 data.guildmembers=[];data.guildinvites=[];
 for(const g of data.guilds){data.guildmembers.push(...query('SELECT * FROM guildmembers WHERE guildId=?',g.guildId));data.guildinvites.push(...query('SELECT * FROM guildinvites WHERE guildId=?',g.guildId));}
 data.slayerlinkinvites=query('SELECT * FROM slayerlinkinvites WHERE senderId=? OR targetId=?',uid,uid);
 data.slayerlinks=query('SELECT * FROM slayerlinks WHERE senderId=? OR targetId=?',uid,uid);
 for(const t of ['slayerlinkstate','slayerlinkpools','slayerlinkxp'])data[t]=data.slayerlinks.flatMap(l=>query(`SELECT * FROM ${t} WHERE linkId=?`,l.linkId));
 const ids=new Set([uid]);
 for(const rows of Object.values(data))for(const row of rows)for(const field of ['userLow','userHigh','requesterId','blockerId','blockedId','leaderId','accountId','inviteeId','inviterId','senderId','targetId','userId','sourceUserId'])if(row[field])ids.add(row[field]);
 const peers=[...ids].filter(id=>id!==uid).map(id=>db.prepare('SELECT userId,name FROM users WHERE userId=?').get(id));
 if(peers.some(p=>!p))throw Error('Social relationship has a missing account');
 return {peers,tables:data};
}
function prepare(db){db.exec(`
 CREATE TABLE IF NOT EXISTS social1105_accounts(userId TEXT PRIMARY KEY, importedAt TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS social1105_stubs(userId TEXT PRIMARY KEY);
 CREATE TABLE IF NOT EXISTS social1105_entities(kind TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(kind,id));`);}
function apply(db,uid,social){
 if(db.prepare('SELECT 1 FROM social1105_accounts WHERE userId=?').get(uid))return;
 if(!social||!Array.isArray(social.peers)||social.peers.length>10000||!social.tables||JSON.stringify(Object.keys(social.tables).sort())!==JSON.stringify([...tables].sort()))throw Error('Missing social migration snapshot');
 const data=social.tables,ids=new Set([uid,...social.peers.map(p=>p.userId)]),links=new Map(data.slayerlinks.map(l=>[l.linkId,l])),guilds=new Set(data.guilds.map(g=>g.guildId));
 for(const [table,rows] of Object.entries(data)){
  if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid social rows');
  const columns=new Set(db.pragma(`table_info(${table})`).map(c=>c.name));
  for(const row of rows){
   if(!row||Object.keys(row).some(k=>!columns.has(k)))throw Error('Social schema changed');
   for(const field of ['userLow','userHigh','requesterId','blockerId','blockedId','leaderId','accountId','inviteeId','inviterId','senderId','targetId','userId','sourceUserId'])if(row[field]&&!ids.has(row[field]))throw Error('Unknown social peer');
   if(table==='friendships'&&row.userLow!==uid&&row.userHigh!==uid||table==='blocks'&&row.blockerId!==uid&&row.blockedId!==uid||['slayerlinks','slayerlinkinvites'].includes(table)&&row.senderId!==uid&&row.targetId!==uid)throw Error('Unrelated social relationship');
   if(['guildmembers','guildinvites'].includes(table)&&!guilds.has(row.guildId))throw Error('Unknown guild');
   if(['slayerlinkstate','slayerlinkpools','slayerlinkxp'].includes(table)){
    const link=links.get(row.linkId);if(!link)throw Error('Unknown Slayer Link');
    if(table==='slayerlinkpools'&&![link.senderId,link.targetId].includes(row.userId))throw Error('Foreign Slayer Link reward pool');
   }
  }
 }
 for(const peer of social.peers){
  if(!/^UID-[a-f0-9-]{36}$/i.test(peer.userId)||typeof peer.name!=='string'||!peer.name||Object.keys(peer).some(k=>!['userId','name'].includes(k)))throw Error('Invalid public peer identity');
  if(db.prepare('SELECT 1 FROM users WHERE userId=?').get(peer.userId))continue;
  if(db.prepare('SELECT 1 FROM users WHERE lower(name)=lower(?)').get(peer.name))throw Error('A social peer name conflicts with a test account');
  db.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES(?,?,0,0)').run(peer.userId,peer.name);
  db.prepare('INSERT INTO social1105_stubs VALUES(?)').run(peer.userId);
 }
 const once=(kind,id,fn)=>{if(db.prepare('SELECT 1 FROM social1105_entities WHERE kind=? AND id=?').get(kind,id))return;fn();db.prepare('INSERT INTO social1105_entities VALUES(?,?)').run(kind,id);};
 const insert=(table,row)=>{
  const keys=db.pragma(`table_info(${table})`).filter(c=>c.pk).map(c=>c.name);
  if(db.prepare(`SELECT 1 FROM ${table} WHERE ${keys.map(k=>`"${k}"=?`).join(' AND ')}`).get(...keys.map(k=>row[k])))return;
  const names=Object.keys(row);db.prepare(`INSERT INTO ${table} (${names.map(k=>`"${k}"`)}) VALUES (${names.map(()=>'?')})`).run(...Object.values(row));
 };
 for(const table of ['friendships','blocks','slayerlinkinvites'])for(const row of data[table]){
  const key=table==='friendships'?[row.userLow,row.userHigh]:table==='blocks'?[row.blockerId,row.blockedId]:[row.inviteId];
  once(table,JSON.stringify(key),()=>insert(table,row));
 }
 for(const guild of data.guilds)once('guild',guild.guildId,()=>{
  insert('guilds',guild);
  for(const table of ['guildmembers','guildinvites'])for(const row of data[table].filter(r=>r.guildId===guild.guildId)){
   if(table==='guildmembers'){const existing=db.prepare('SELECT guildId FROM guildmembers WHERE accountId=?').get(row.accountId);if(existing&&existing.guildId!==guild.guildId)throw Error('Guild membership conflicts with test progression');}
   insert(table,row);
  }
 });
 for(const link of data.slayerlinks)once('link',link.linkId,()=>{
  insert('slayerlinks',link);for(const table of ['slayerlinkstate','slayerlinkpools','slayerlinkxp'])for(const row of data[table].filter(r=>r.linkId===link.linkId))insert(table,row);
 });
 // A partner may claim on live after the first participant migrated. Their freshly
 // copied inventory includes that loot, so import its receipt too, never grant it again.
 for(const pool of data.slayerlinkpools.filter(p=>p.userId===uid&&p.claimedAt!=null)){
  db.prepare('UPDATE slayerlinkpools SET claimTransactionId=?,claimCharacterId=?,claimedRewards=?,claimedAt=? WHERE linkId=? AND userId=? AND claimedAt IS NULL').run(pool.claimTransactionId,pool.claimCharacterId,pool.claimedRewards,pool.claimedAt,pool.linkId,uid);
 }
 db.prepare('INSERT INTO social1105_accounts VALUES(?,?)').run(uid,new Date().toISOString());
}
module.exports={collect,prepare,apply};
