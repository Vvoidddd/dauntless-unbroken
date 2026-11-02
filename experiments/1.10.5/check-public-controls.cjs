const assert=require('node:assert/strict'),Database=require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
const {merge,exportControls}=require('./merge-public-controls.cjs');
const source=new Database(':memory:'),target=new Database(':memory:');
const schema=`CREATE TABLE invitecodes(inviteCode TEXT PRIMARY KEY,usesRemaining INTEGER,infiniteUses INTEGER);
CREATE TABLE discord_invites(discordId TEXT PRIMARY KEY,inviteCode TEXT UNIQUE,createdAt INTEGER);
CREATE TABLE account_bans(account_id TEXT PRIMARY KEY,active INTEGER,updated_at INTEGER);
CREATE TABLE discord_moderation(discordId TEXT PRIMARY KEY,active INTEGER,updatedAt INTEGER);
CREATE TABLE account_device_signals(account_id TEXT,kind TEXT,signal_hash TEXT,observed_at INTEGER,PRIMARY KEY(account_id,kind));
CREATE TABLE device_ban_signals(account_id TEXT,kind TEXT,signal_hash TEXT,PRIMARY KEY(account_id,kind));`;
try{
 for(const db of [source,target])db.exec(schema);
 source.exec("INSERT INTO invitecodes VALUES('spent',1,0),('unused',1,0);INSERT INTO account_bans VALUES('A',1,10),('B',1,10)");
 target.exec("INSERT INTO invitecodes VALUES('spent',0,0);INSERT INTO account_bans VALUES('B',0,20)");
 merge(target,exportControls(source));merge(target,exportControls(source));
 assert.equal(target.prepare("SELECT usesRemaining FROM invitecodes WHERE inviteCode='spent'").get().usesRemaining,0);
 assert.equal(target.prepare("SELECT usesRemaining FROM invitecodes WHERE inviteCode='unused'").get().usesRemaining,1);
 assert.equal(target.prepare("SELECT active FROM account_bans WHERE account_id='A'").get().active,1);
 assert.equal(target.prepare("SELECT active FROM account_bans WHERE account_id='B'").get().active,0);
 source.exec("INSERT INTO discord_invites VALUES('one','unused',1)");target.exec("INSERT INTO discord_invites VALUES('two','unused',1)");
 assert.throws(()=>merge(target,exportControls(source)),/another Discord/);
 assert.equal(target.prepare('SELECT count(*) n FROM discord_invites').get().n,1);
 console.log('Consumed invites, idempotence, latest bans/unbans and conflicting ownership checked.');
}finally{source.close();target.close();}
