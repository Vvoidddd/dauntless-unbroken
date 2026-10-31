// Run against the isolated loopback backend only. Tokens never leave this process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const jwt = require('../../DauntlessUnbrokenMetagame/node_modules/jsonwebtoken');
const { privateKey, gameserverKey } = JSON.parse(fs.readFileSync(path.join(root, 'backend-state/secrets.json')));
function token(userId) {
  return jwt.sign({ userId, epoch: 0 }, privateKey, { algorithm: 'RS256', expiresIn: '1m',
    issuer: 'dauntless-unbroken-metagame', audience: 'dauntless-unbroken-metagame' });
}
async function check() {
  for (const [route, method] of [['trigger', 'POST'], ['status', 'GET']]) {
    const url = `http://127.0.0.1:62000/migration/${route}`;
    const call = authorization => fetch(url, { method, headers: authorization ? { authorization } : {}, signal: AbortSignal.timeout(3000) });
    assert.equal((await call()).status, 401);
    assert.equal((await call(`Bearer ${token('UID-local-foreign-account')}`)).status, 403);
    const reply = await call(`Bearer ${token('UID-6f8b231d-f682-4cbb-b5e2-a9972f641ea4')}`);
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { migration_finished: true, migration_failed: false });
  }
  const headers = { authorization: `Bearer ${token('UID-6f8b231d-f682-4cbb-b5e2-a9972f641ea4')}`, 'content-type': 'application/json' };
  for (const route of ['/pjm', '/pjm/UID-6f8b231d-f682-4cbb-b5e2-a9972f641ea4']) {
    const url = 'http://127.0.0.1:62000' + route;
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { authorization: `Bearer ${token('UID-local-foreign-account')}` } })).status, 403);
    const reply = await fetch(url, { headers });
    assert.equal(reply.status, 200);
    assert.deepEqual(await reply.json(), { code: '', message: 'OK', payload: { nodes: {}, update_version: 0 } });
  }
  assert.equal((await fetch('http://127.0.0.1:62000/pjm/UID-local-foreign-account', { headers })).status, 403);
  const serverHeaders = { 'x-dauntless-unbroken-gameserver-apikey': gameserverKey };
  assert.equal((await fetch('http://127.0.0.1:62000/pjm/UID-6f8b231d-f682-4cbb-b5e2-a9972f641ea4', { headers: serverHeaders })).status, 200);
  assert.equal((await fetch('http://127.0.0.1:62000/pjm/UID-local-foreign-account', { headers: serverHeaders })).status, 403);
  assert.equal((await fetch('http://127.0.0.1:62000/pjm/UID-6f8b231d-f682-4cbb-b5e2-a9972f641ea4', { headers: { 'x-dauntless-unbroken-gameserver-apikey': 'invalid' } })).status, 401);
  for (const suffix of ['', '_daily', '_weekly']) {
    const reply = await fetch('http://127.0.0.1:62000/game_tuning/bounty_game_data' + suffix);
    assert.equal(reply.status, 200);
    const data = await reply.json();
    assert.equal(data.code, '');
    assert.equal(data.payload.max_slots, 0);
    assert.deepEqual(data.payload.bounty_data, []);
    assert.equal(data.payload.delete_claimed_bounties, true);
  }
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
  console.log('Local migration contract: authenticated synthetic account only; both response shapes passed.');
  console.log('Local allocation: listening Ramsgate endpoint and 1.10.5 build ID passed; this does not prove a playable join.');
}
check().catch(error => { console.error(error.message); process.exitCode = 1; });
