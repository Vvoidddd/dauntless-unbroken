// Run against the isolated loopback backend only. Tokens never leave this process.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const jwt = require('../../DauntlessUnbrokenMetagame/node_modules/jsonwebtoken');
const { privateKey } = JSON.parse(fs.readFileSync(path.join(root, 'backend-state/secrets.json')));
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
  console.log('Local migration contract: authenticated synthetic account only; both response shapes passed.');
}
check().catch(error => { console.error(error.message); process.exitCode = 1; });
