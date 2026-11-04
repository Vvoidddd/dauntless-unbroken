// Import approved read-only exports into a separate local realm; never overwrite a tested character.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const assert = require('node:assert/strict');
const net = require('node:net');
const Database = require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
const {applyExperience} = require('./migrate-experience.cjs');
const {ApplyCurrencyMigration} = require('./migrate-currency.cjs');
const state = path.resolve(__dirname, '../../../backend-state');
const allowed = new Set('users characters userapikeys authepochs loadouts breadcrumbs encounteredcontent loadoutslots discordlinks huntregions bounties bountydraft cooldowns entitlements huntpassselection objectives progress_tracks escalationprogression escalationtalents escalationunlocks leaderboardprofiles inventories account_playtime'.split(' '));
async function main() {
  // Never change credentials underneath a running local realm.
  await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(Error('Stop the local backend before importing accounts.')));probe.listen(62000,'127.0.0.1',()=>probe.close(resolve));});
  const source = path.join(state, 'friends-live-export.json');
  const raw = fs.readFileSync(source);
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), fs.readFileSync(source.replace('.json','.sha256'),'utf8').trim());
  const exports = JSON.parse(raw), target = path.join(state,'realm.db');
  const firstImport = !fs.existsSync(target);
  if (firstImport) {
    const existing = new Database(path.join(state,'imported.db'),{readonly:true,fileMustExist:true});
    try { await existing.backup(target); } finally { existing.close(); }
  }
  const db = new Database(target,{fileMustExist:true});
  const report = [];
  try {
    db.transaction(() => {
      for (const ex of exports) {
        assert.ok(ex.format===1 && ex.readOnly===true && ex.source==='live-1.4.4');
        assert.equal(ex.tables.users.length,1);
        assert.equal(ex.tables.users[0].userId,ex.userId);
        assert.deepEqual(new Set(Object.keys(ex.tables)),allowed);
        const exists = db.prepare('SELECT 1 FROM users WHERE userId=?').get(ex.userId);
        if (!exists) for (const [table,rows] of Object.entries(ex.tables)) {
          const columns = new Set(db.pragma(`table_info(${table})`).map(x=>x.name));
          for (const row of rows) {
            assert.ok(Object.keys(row).every(k=>columns.has(k)));
            const keys=Object.keys(row);
            db.prepare(`INSERT INTO ${table} (${keys.map(k=>'"'+k+'"').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(row));
          }
        }
        // Original keys work on the test realm. No plaintext live key is exported.
        assert.equal(ex.tables.userapikeys.length,1);
        if (firstImport || !exists) db.prepare('UPDATE userapikeys SET keyHash=? WHERE userId=?').run(ex.tables.userapikeys[0].keyHash,ex.userId);
        if (!exists) for (const row of ex.tables.inventories) {
          assert.deepEqual(db.prepare('SELECT instancedItems,stackedItems FROM inventories WHERE characterId=?').get(row.characterId),
            {instancedItems:row.instancedItems,stackedItems:row.stackedItems});
        }
        ApplyCurrencyMigration(db,ex.userId);
        const initialized=applyExperience(db,ex.userId);
        report.push({name:ex.tables.users[0].name,imported:!exists,weaponTracksAdded:initialized});
      }
      // Production administrator and game-server credentials never authorize this realm.
      if (firstImport) db.exec('UPDATE users SET isAdmin=0; DELETE FROM gameserverapikeys; DELETE FROM gameserverapikeystoregister; DELETE FROM userapikeystoregister; DELETE FROM invitecodes');
      for (const ex of exports) db.prepare('UPDATE users SET isAdmin=0 WHERE userId=?').run(ex.userId);
      const ownerFile=path.join(state,'realm-owner.key');
      const key=fs.existsSync(ownerFile)?fs.readFileSync(ownerFile,'utf8').trim():'UUK-'+crypto.randomBytes(32).toString('hex');
      const uid='UID-11050000-0000-4000-8000-000000000001';
      db.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES (?, ?, 0, 1) ON CONFLICT(userId) DO UPDATE SET isAdmin=1').run(uid,'LabOwner');
      db.prepare('INSERT INTO userapikeys(userId,keyHash) VALUES (?,?) ON CONFLICT(userId) DO UPDATE SET keyHash=excluded.keyHash').run(uid,crypto.createHash('sha256').update(key).digest('hex'));
      if (!fs.existsSync(ownerFile)) fs.writeFileSync(ownerFile,key,{flag:'wx'});
    })();
    assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
    fs.writeFileSync(path.join(state,'realm-import-report.json'),JSON.stringify({sourceHash:crypto.createHash('sha256').update(raw).digest('hex'),accounts:report,liveModified:false},null,2));
    console.log(JSON.stringify({accounts:report,integrity:'ok',liveModified:false}));
  } finally { db.close(); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
