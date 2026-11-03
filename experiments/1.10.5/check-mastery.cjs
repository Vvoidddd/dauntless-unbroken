const assert = require('node:assert/strict');
const path = require('node:path');
process.env.PROGRESSION_CONFIG_DIR = path.join(__dirname, 'progression');
const {GetProgressionPath, ComputeEarnedRanks} = require('../../DauntlessUnbrokenMetagame/dist/controllers/progressionrank');
const legacy = require('../../DauntlessUnbrokenMetagame/src/vendor/progression_config.json').payload.paths;
const paths = require('./progression/mastery.json');
assert.equal(paths.length, 9);
assert.equal(paths.reduce((n,p) => n+p.free_rewards.length, 0), 239);
for (const track of paths) {
  assert.deepEqual(GetProgressionPath(track.progression_id), track);
  const old = Object.values(legacy).find(p => p.progression_id === track.progression_id);
  assert.deepEqual(track.requirements, old.requirements, 'Reward correction must not change earned levels');
  assert.ok(track.free_rewards.some(r => r.stacked_items.some(i => i.catalog_id === 'CURRENCY_PJM_WEAPON')));
  for (const r of track.free_rewards) {
    assert.ok(r.stacked_items.every(i => Number.isSafeInteger(i.quantity) && i.quantity >= 0));
    for (const key of ['instanced_items','ordered_instanced_items','entitlements','buffs']) assert.deepEqual(r[key], []);
  }
}
const sword = GetProgressionPath('MasteryTrack_Weapon_Sword');
// The shipped table has two zero-quantity core placeholders; do not invent rewards for them.
assert.equal(paths.flatMap(t => t.free_rewards).flatMap(r => r.stacked_items).filter(i => i.quantity === 0).length, 2);
assert.equal(sword.free_rewards.find(r => r.rank_id === 3).stacked_items.find(i => i.catalog_id === 'CURRENCY_PJM_WEAPON').quantity, 10);
assert.equal(ComputeEarnedRanks(GetProgressionPath('MasteryTrack_PlayerLevel'), 512, false).EarnedFreeRank, 37);
console.log('All 9 native mastery reward tracks load; merit rewards and existing level thresholds verified.');
