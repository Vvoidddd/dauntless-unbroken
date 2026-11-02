const {createHash}=require('node:crypto'),fs=require('node:fs');
const allowed=new Set('users characters userapikeys authepochs loadouts breadcrumbs encounteredcontent loadoutslots discordlinks huntregions bounties bountydraft cooldowns entitlements huntpassselection objectives progress_tracks escalationprogression escalationtalents escalationunlocks leaderboardprofiles inventories account_playtime'.split(' '));
const social=require('./migration-social.cjs'),merits=require('./migration-merits.cjs');
const hashKey=key=>createHash('sha256').update(key).digest('hex');
function prepare(db){social.prepare(db);merits.prepare(db);db.exec('CREATE TABLE IF NOT EXISTS imports1105(userId TEXT PRIMARY KEY,sourceDate TEXT NOT NULL,importedAt TEXT NOT NULL)');}
function admit(db,hash,code,ex){
 return db.transaction(()=>{
  const existing=db.prepare('SELECT u.userId,u.name FROM userapikeys k JOIN users u ON u.userId=k.userId WHERE k.keyHash=?').get(hash);
  if(existing)return {Username:existing.name,UserId:existing.userId,imported:false};
  if(!ex||ex.format!==1||ex.source!=='live-1.4.4'||!ex.readOnly||!/^UID-[a-f0-9-]{36}$/i.test(ex.userId)||!ex.tables||JSON.stringify(Object.keys(ex.tables).sort())!==JSON.stringify([...allowed].sort()))throw Error('Invalid migration data');
  const uid=ex.userId,users=ex.tables.users,keys=ex.tables.userapikeys;
  if(users.length!==1||users[0].userId!==uid||typeof users[0].name!=='string'||keys.length!==1||keys[0].userId!==uid||keys[0].keyHash!==hash)throw Error('Account proof did not match');
  const stub=db.prepare('SELECT 1 FROM social1105_stubs WHERE userId=?').get(uid);
  if(db.prepare('SELECT 1 FROM users WHERE (userId=? AND ?=0) OR (userId<>? AND lower(name)=lower(?))').get(uid,stub?1:0,uid,users[0].name))throw Error('An account with that identity already exists in the test realm. Contact the host.');
  const invite=db.prepare('SELECT * FROM invitecodes WHERE inviteCode=? AND (infiniteUses=1 OR usesRemaining>0)').get(code);
  if(!invite)throw Error('That test invite is invalid or already used.');
  const owner=db.prepare('SELECT discordId FROM discord_invites WHERE inviteCode=?').get(code);
  if(owner&&!ex.tables.discordlinks.some(x=>x.userId===uid&&x.discordId===owner.discordId))throw Error('This invite belongs to a different Discord account.');
  const chars=new Set(ex.tables.characters.map(x=>x.characterId));
  for(const [table,rows] of Object.entries(ex.tables)){
   if(!Array.isArray(rows)||rows.length>100000)throw Error('Invalid migration rows');
   const columns=new Set(db.pragma(`table_info(${table})`).map(x=>x.name));
   for(const original of rows){
    const row={...original};if(table==='users')row.isAdmin=0;
    if(table==='users'&&stub){db.prepare('UPDATE users SET name=?,notes=?,isAdmin=0 WHERE userId=?').run(row.name,row.notes,uid);db.prepare('DELETE FROM social1105_stubs WHERE userId=?').run(uid);continue;}
    if(('userId' in row&&row.userId!==uid)||('accountId' in row&&row.accountId!==uid)||('account_id' in row&&row.account_id!==uid)||('characterId' in row&&table!=='characters'&&!chars.has(row.characterId)))throw Error('Migration contained another account');
    const names=Object.keys(row);if(!names.length||names.some(k=>!columns.has(k)))throw Error('Save schema changed; migration stopped safely.');
    db.prepare(`INSERT INTO ${table} (${names.map(k=>'"'+k+'"').join(',')}) VALUES (${names.map(()=>'?').join(',')})`).run(...Object.values(row));
   }
  }
  require('./migrate-experience.cjs').applyExperience(db,uid);
  social.apply(db,uid,ex.social);merits.grant(db,uid);
  const spent=db.prepare('UPDATE invitecodes SET usesRemaining=CASE WHEN infiniteUses=1 THEN usesRemaining ELSE usesRemaining-1 END WHERE inviteCode=? AND (infiniteUses=1 OR usesRemaining>0)').run(code);
  if(spent.changes!==1)throw Error('Invite was used before migration completed.');
  db.prepare('INSERT INTO imports1105 VALUES(?,?,?)').run(uid,ex.exportedAt,new Date().toISOString());
  return {Username:users[0].name,UserId:uid,imported:true};
 })();
}
async function exportRemote(config,hash){
 if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Invalid account proof');
 const unavailable=()=>Error('Live save service is unavailable. Your invite has not been used.');
 const pins=fs.readFileSync(config.knownHosts,'utf8').split(/\r?\n/).map(l=>l.trim().split(/\s+/)).filter(l=>l[0].split(',').includes(config.host)&&l[2]).map(l=>Buffer.from(l[2],'base64'));
 if(!pins.length)throw unavailable();
 // Consume SSH channel data directly: Windows ssh.exe stalls on larger saves.
 const {Client}=require('../../DauntlessUnbrokenMetagame/node_modules/ssh2');
 return new Promise((resolve,reject)=>{
  const client=new Client(),chunks=[];let size=0,done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);client.destroy();error?reject(error):resolve(value);};
  const timer=setTimeout(()=>finish(unavailable()),25000);
  const parse=()=>{let frame;try{frame=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return false;}
   try{const ex=frame.gzip?JSON.parse(require('node:zlib').gunzipSync(Buffer.from(Array.isArray(frame.gzip)?frame.gzip.join(''):frame.gzip,'base64'),{maxOutputLength:16*1024**2}).toString('utf8')):frame;
    if(ex.error==='account_not_found')finish(Error('The account key was not found on the live Unbroken realm.'));
    else if(ex.error)finish(unavailable());else finish(null,ex);
   }catch{finish(unavailable());}return true;
  };
  client.on('error',()=>finish(unavailable()));client.on('close',()=>{if(!done&&!parse())finish(unavailable());});
  client.on('ready',()=>client.exec('export-1105-account '+hash,(error,stream)=>{
   if(error){finish(unavailable());return;}
   stream.on('data',data=>{size+=data.length;if(size>16*1024**2){finish(unavailable());return;}chunks.push(data);if(data[data.length-1]===10)parse();});
   stream.on('error',()=>finish(unavailable()));stream.stderr.resume();stream.on('close',()=>{if(!done&&!parse())finish(unavailable());});stream.end();
  }));
  try{client.connect({host:config.host,username:'Administrator',privateKey:fs.readFileSync(config.identity),hostVerifier:key=>pins.some(pin=>pin.equals(key)),readyTimeout:10000});}catch{finish(unavailable());}
 });
}
function createLogin(db,config,exporter=hash=>exportRemote(config,hash)){
 prepare(db);const pending=new Map();
 return async(key,code)=>{
  if(typeof key!=='string'||!/^UUK[-_][a-f0-9]{48,64}$/i.test(key))throw Error('That does not look like an account key.');
  const hash=hashKey(key),existing=db.prepare('SELECT u.userId,u.name FROM userapikeys k JOIN users u ON u.userId=k.userId WHERE k.keyHash=?').get(hash);
  if(existing)return {Username:existing.name,UserId:existing.userId,imported:false};
  if(typeof code!=='string'||!/^[A-Za-z0-9-]{4,64}$/.test(code)||!db.prepare('SELECT 1 FROM invitecodes WHERE inviteCode=? AND (infiniteUses=1 OR usesRemaining>0)').get(code))throw Error('Paste a new 1.10.5 test invite to copy your live account.');
  if(pending.has(hash))return pending.get(hash);
  const job=(async()=>admit(db,hash,code,await exporter(hash)))();pending.set(hash,job);try{return await job;}finally{pending.delete(hash);}
 };
}
// Backfill older test imports without replacing any test inventory/progression.
function completeExisting(db,hash,ex){return db.transaction(()=>{
 const user=db.prepare('SELECT userId FROM userapikeys WHERE keyHash=?').get(hash);
 if(!user||ex?.source!=='live-1.4.4'||ex.readOnly!==true||ex.userId!==user.userId||ex.tables?.userapikeys?.length!==1||ex.tables.userapikeys[0].keyHash!==hash||ex.tables.userapikeys[0].userId!==user.userId)throw Error('Existing account proof did not match');
 social.apply(db,user.userId,ex.social);merits.grant(db,user.userId);
 db.prepare('INSERT OR IGNORE INTO imports1105 VALUES(?,?,?)').run(user.userId,ex.exportedAt,new Date().toISOString());
 return user.userId;
})();}
module.exports={prepare,admit,createLogin,hashKey,exportRemote,completeExisting};
