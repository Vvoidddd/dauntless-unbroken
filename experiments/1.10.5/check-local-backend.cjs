// Run against the isolated loopback backend only. Tokens never leave this process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const selected = require('./lab-account.cjs');
const Database = require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
const db = new Database(selected.database, { readonly: true });
const jwt = require('../../DauntlessUnbrokenMetagame/node_modules/jsonwebtoken');
const { privateKey, gameserverKey } = JSON.parse(fs.readFileSync(path.join(root, 'backend-state/secrets.json')));
function token(userId) {
  const epoch = db.prepare('SELECT epoch FROM authepochs WHERE userId=?').get(userId)?.epoch ?? 0;
  return jwt.sign({ userId, epoch }, privateKey, { algorithm: 'RS256', expiresIn: '1m',
    issuer: 'dauntless-unbroken-metagame', audience: 'dauntless-unbroken-metagame' });
}
async function check() {
  for (const [route, method] of [['trigger', 'POST'], ['status', 'GET']]) {
    const url = `http://127.0.0.1:62000/migration/${route}`;
    const call = authorization => fetch(url, { method, headers: authorization ? { authorization } : {}, signal: AbortSignal.timeout(3000) });
    assert.equal((await call()).status, 401);
    assert.equal((await call(`Bearer ${token('UID-local-foreign-account')}`)).status, 403);
    const reply = await call(`Bearer ${token(selected.userId)}`);
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { migration_finished: true, migration_failed: false });
  }
  const headers = { authorization: `Bearer ${token(selected.userId)}`, 'content-type': 'application/json' };
  for (const route of ['/pjm', '/pjm/' + selected.userId]) {
    const url = 'http://127.0.0.1:62000' + route;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: `Bearer ${token('UID-local-foreign-account')}` } })).status, 403);
    const reply = await fetch(url, { headers });
    assert.equal(reply.status, 200);
    const saved = db.prepare('SELECT nodes, updateVersion FROM playerjourney WHERE accountId=?').get(selected.userId);
    assert.deepEqual(await reply.json(), { code: '', message: 'OK', payload: {
      nodes: saved ? JSON.parse(saved.nodes) : {}, update_version: saved?.updateVersion ?? 0,
    } });
  }
  assert.equal((await fetch('http://127.0.0.1:62000/pjm/UID-local-foreign-account', { headers })).status, 403);
  const serverHeaders = { 'x-dauntless-unbroken-gameserver-apikey': gameserverKey };
  // Native Bounty initialization asks HuntPassComponent for season17's dates.
  // A valid Bounty response alone cannot prevent its return-to-menu path.
  for (const auth of [headers, serverHeaders]) {
    const reply = await fetch('http://127.0.0.1:62000/progression/config', { headers: auth });
    assert.equal(reply.status, 200);
    const paths = (await reply.json()).payload.paths;
    const season = paths.filter(track => track.progression_id === 'season17');
    assert.equal(season.length, 1);
    assert.ok(Date.parse(season[0].start_date) < Date.now());
    assert.ok(Date.parse(season[0].end_date) > Date.now());
    assert.deepEqual(season[0].free_rewards, []); // Local login fixture, not a ported reward season.
    assert.deepEqual(season[0].premium_rewards, []);
    for (const track of require('./progression/experience.json')) {
      assert.deepEqual(paths.find(p => p.progression_id === track.progression_id), track);
    }
  }
  const progressReply = await fetch(`http://127.0.0.1:62000/progression/${selected.userId}`, { headers });
  assert.equal(progressReply.status, 200);
  const tracks = (await progressReply.json()).payload;
  for (const config of require('./progression/experience.json')) {
    const saved = db.prepare('SELECT progress,confirmedFreeRank FROM progress_tracks WHERE accountId=? AND progressionId=?').get(selected.userId, config.progression_id);
    const track = tracks.find(p => p.progression_id === config.progression_id);
    assert.ok(track, `Missing experience record: ${config.progression_id}`);
    assert.equal(track.progress, saved?.progress ?? 0);
    assert.equal(track.confirmed_fremium_rank, saved?.confirmedFreeRank ?? 0);
  }
  assert.equal((await fetch('http://127.0.0.1:62000/pjm/' + selected.userId, { headers: serverHeaders })).status, 200);
  assert.equal((await fetch('http://127.0.0.1:62000/pjm/UID-local-foreign-account', { headers: serverHeaders })).status, 403);
  assert.equal((await fetch('http://127.0.0.1:62000/pjm/' + selected.userId, { headers: { 'x-dauntless-unbroken-gameserver-apikey': 'invalid' } })).status, 401);
  for (const suffix of ['', '_daily', '_weekly']) {
    const reply = await fetch('http://127.0.0.1:62000/game_tuning/bounty_game_data' + suffix);
    assert.equal(reply.status, 200);
    const data = await reply.json();
    assert.equal(data.code, '');
    assert.equal(data.payload.max_slots, 0);
    assert.deepEqual(data.payload.bounty_data, []);
    assert.equal(data.payload.delete_claimed_bounties, true);
  }
  console.log('Local backend: auth, persisted Journey snapshot and login fixtures checked.');
  // Opt in while the game is closed: joining a candidate changes the active travel request.
  if (!process.argv.includes('--matchmaking')) return;
  const joined = await fetch('http://127.0.0.1:62000/candidate/join', { method: 'POST', headers,
    body: JSON.stringify({ gameMode: 'CITY', gameArgs: '', isPrivate: true }), signal: AbortSignal.timeout(8000) });
  assert.equal(joined.status, 200);
  const candidate = await joined.json();
  let status;
  for (let attempt = 0; attempt < 8; attempt++) {
    const reply = await fetch('http://127.0.0.1:62000/candidate/status', { headers, signal: AbortSignal.timeout(8000) });
    assert.equal(reply.status, 200);
    status = await reply.json();
    if (status.status !== 'MATCHING') break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.equal(status.candidateId, candidate.candidateId);
  assert.equal(status.status, 'IN_PROGRESS');
  assert.equal(status.serverInfo.host, '127.0.0.1');
  assert.equal(status.serverInfo.port, 62770);
  assert.equal(status.serverInfo.buildId, '365075_rel-1.10.5_shipping');
  console.log('Local migration fixture: authenticated selected test account only; both response shapes passed.');
  console.log('Local allocation: listening Ramsgate endpoint and 1.10.5 build ID passed; this does not prove a playable join.');
}
check().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.close());
