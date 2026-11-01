// Local compatibility step: keep Mastery and initialize only missing weapon-skill tracks.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const config = require('./progression/experience.json');
// New weapon skills start at zero XP; legacy gear, Mastery and unlocks stay intact.
const plan = config.filter(p => p.progression_id.startsWith('ExperienceTrack_Weapon_'))
  .map(p => ({ progressionId: p.progression_id, rank: 1, progress: 0 }));

function applyExperience(db, userId) {
  return db.transaction(() => {
    let added = 0;
    for (const row of plan) added += db.prepare(`INSERT INTO progress_tracks
      (accountId, progressionId, progress, confirmedFreeRank, confirmedPremiumRank, confirmedDate, updatedDate)
      VALUES (?, ?, ?, ?, 0, ?, ?) ON CONFLICT(accountId,progressionId) DO NOTHING`)
      .run(userId, row.progressionId, row.progress, row.rank, new Date().toISOString(), new Date().toISOString()).changes;
    return added;
  })();
}

async function main() {
  const selected = require('./lab-account.cjs');
  assert.equal(selected.profile, 'imported', 'Select the private imported lab profile first');
  const state = path.resolve(__dirname, '../../../backend-state');
  assert.equal(selected.database, path.join(state, 'imported.db'));
  const raw = fs.readFileSync(path.join(state, 'void-live-export.json'));
  assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), selected.sourceHash);
  const source = JSON.parse(raw);
  assert.ok(source.readOnly && source.source === 'live-1.4.4' && source.userId === selected.userId);
  console.table(plan);
  if (!process.argv.includes('--apply')) return;
  const game = path.resolve(state, '../game/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe');
  const running = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `Get-CimInstance Win32_Process -Filter "Name='Dauntless-Win64-Shipping.exe'" | Where-Object ExecutablePath -eq '${game.replaceAll("'", "''")}' | Select-Object -ExpandProperty ProcessId`],
    { windowsHide: true, encoding: 'utf8', timeout: 10000 }).trim();
  assert.equal(running, '', 'Close the isolated game and world servers before changing progression');
  const Database = require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
  const db = new Database(selected.database, { fileMustExist: true });
  try {
    const backup = path.join(state, 'imported-before-experience.db');
    if (!fs.existsSync(backup)) await db.backup(backup);
    const mastery = () => db.prepare("SELECT * FROM progress_tracks WHERE accountId=? AND progressionId LIKE 'MasteryTrack_%' ORDER BY progressionId").all(selected.userId);
    const before = mastery();
    const added = applyExperience(db, selected.userId);
    assert.deepEqual(mastery(), before);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    console.log(`Local weapon experience: ${added} tracks added; existing XP, Mastery and reforge counts preserved.`);
  } finally { db.close(); }
}
module.exports = { applyExperience };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
