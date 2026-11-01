// Before the first in-game save: verify the private imported copy, never the live DB.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const state = path.resolve(__dirname, '../../../backend-state');
const profile = JSON.parse(fs.readFileSync(path.join(state, 'imported-account.json')));
const raw = fs.readFileSync(path.join(state, 'void-live-export.json'));
assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), profile.sourceHash);
const source = JSON.parse(raw);
assert.equal(source.readOnly, true);
assert.equal(source.tables.users[0].name, 'Void');
assert.equal(source.userId, profile.userId);
const pair = JSON.parse(fs.readFileSync(path.join(state, 'secrets.json')));
process.env.DB_FILENAME = path.join(state, 'imported.db');
assert.ok(fs.existsSync(process.env.DB_FILENAME));
process.env.AUTH_SIGNING_PRIVKEY_B64 = Buffer.from(pair.privateKey).toString('base64');
process.env.AUTH_SIGNING_PUBKEY_B64 = Buffer.from(pair.publicKey).toString('base64');
process.chdir(path.resolve(__dirname, '../../DauntlessUnbrokenMetagame'));
const { GetDb } = require('../../DauntlessUnbrokenMetagame/dist/db');
const auth = require('../../DauntlessUnbrokenMetagame/dist/controllers/auth');
async function check() {
  const db = GetDb().$client;
  try {
    assert.equal(await auth.GetUserIDForAPIKey(profile.UUK), profile.userId);
    assert.equal(await auth.GetUserIDForAPIKey('not-a-key'), undefined);
    assert.equal(auth.ValidateMetagameJWTAndGetPayload(auth.SignMetagameJWTForUid(profile.userId)).userId, profile.userId);
    for (const character of source.tables.characters) {
      const saved = db.prepare('SELECT data, updateVersion FROM characters WHERE characterId=? AND userId=?').get(character.characterId, profile.userId);
      assert.equal(saved.data, character.data);
      assert.equal(saved.updateVersion, character.updateVersion);
    }
    for (const inventory of source.tables.inventories) {
      const saved = db.prepare('SELECT instancedItems, stackedItems FROM inventories WHERE characterId=?').get(inventory.characterId);
      assert.equal(saved.instancedItems, inventory.instancedItems);
      assert.equal(saved.stackedItems, inventory.stackedItems);
    }
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    console.log('Void local import: disposable key authenticates; character and inventory match the read-only export; integrity OK.');
    console.log('This verifies preservation and backend authentication, not 1.10.5 item or quest conversion.');
  } finally { db.close(); }
}
check().catch(error => { console.error(error.message); process.exitCode = 1; });
