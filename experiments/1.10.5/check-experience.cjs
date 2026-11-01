const assert = require('node:assert/strict');
const path = require('node:path');
process.env.PROGRESSION_CONFIG_DIR = path.join(__dirname, 'progression');
process.env.ACTIVE_HUNT_PASS = 'season17';
const { GetProgressionPath, ComputeEarnedRanks } = require('../../DauntlessUnbrokenMetagame/dist/controllers/progressionrank');
const paths = require('./progression/experience.json');
const { applyExperience } = require('./migrate-experience.cjs');
const Database = require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
assert.equal(new Set(paths.map(p => p.progression_id)).size, 15);
for (const config of paths) {
  const track = GetProgressionPath(config.progression_id);
  assert.deepEqual(track, config);
  assert.equal(ComputeEarnedRanks(track, 0, false).EarnedFreeRank, config.progression_id.startsWith('Prestige') ? 0 : 1);
  if (config.progression_id.startsWith('ExperienceTrack_Weapon_')) {
    for (const [xp, rank] of [[349,1],[350,2],[17549,14],[17550,15],[27774,19],[27775,20]])
      assert.equal(ComputeEarnedRanks(track, xp, false).EarnedFreeRank, rank);
  }
}
assert.equal(ComputeEarnedRanks(GetProgressionPath('MasteryTrack_PlayerLevel'), 512, false).EarnedFreeRank, 37);
const db = new Database(':memory:');
try {
  db.exec(`CREATE TABLE progress_tracks(accountId TEXT, progressionId TEXT, progress INTEGER,
    confirmedFreeRank INTEGER, confirmedPremiumRank INTEGER, confirmedDate TEXT, updatedDate TEXT,
    PRIMARY KEY(accountId,progressionId));
    INSERT INTO progress_tracks VALUES('test','MasteryTrack_PlayerLevel',512,37,0,'old','old');
    INSERT INTO progress_tracks VALUES('test','PrestigeTrack_Weapon_Sword',4,4,0,'old','old');
    INSERT INTO progress_tracks VALUES('other','ExperienceTrack_Weapon_Sword',350,2,0,'old','old');`);
  assert.equal(applyExperience(db,'test'),7);
  const fresh = db.prepare("SELECT progress, confirmedFreeRank FROM progress_tracks WHERE accountId='test' AND progressionId LIKE 'ExperienceTrack_Weapon_%'").all();
  assert.equal(fresh.length,7);
  assert.ok(fresh.every(p => p.progress === 0 && p.confirmedFreeRank === 1));
  db.prepare("UPDATE progress_tracks SET progress=350, confirmedFreeRank=2 WHERE accountId='test' AND progressionId='ExperienceTrack_Weapon_Sword'").run();
  assert.equal(applyExperience(db,'test'),0, 'Retry must not reset later play or reforge progress');
  assert.equal(db.prepare("SELECT progress FROM progress_tracks WHERE accountId='test' AND progressionId='ExperienceTrack_Weapon_Sword'").get().progress,350);
  assert.equal(db.prepare("SELECT progress FROM progress_tracks WHERE accountId='test' AND progressionId='MasteryTrack_PlayerLevel'").get().progress,512);
  assert.equal(db.prepare("SELECT progress FROM progress_tracks WHERE accountId='test' AND progressionId='PrestigeTrack_Weapon_Sword'").get().progress,4);
  assert.equal(db.prepare("SELECT progress FROM progress_tracks WHERE accountId='other'").get().progress,350);
} finally { db.close(); }
console.log('Experience config, zero-XP start, level boundaries and non-destructive migration retries passed.');
