const assert = require('node:assert/strict');
const { waitForHuntReady } = require('./hunt-readiness.cjs');

(async () => {
  const world = {host: '127.0.0.1', port: 63872};
  let calls = 0;
  assert.equal(await waitForHuntReady(async () => world, 100, 5), world);
  assert.equal(await waitForHuntReady(async () => ++calls >= 3 ? world : undefined, 100, 5), world);
  assert.equal(calls, 3);
  assert.equal(await waitForHuntReady(async () => undefined, 20, 5), undefined);
  await assert.rejects(waitForHuntReady(async () => { throw new Error('probe failed'); }, 100, 5), /probe failed/);
  const started = Date.now();
  assert.equal(await waitForHuntReady(() => new Promise(() => {}), 20, 5), undefined);
  assert.ok(Date.now() - started < 1000, 'a stuck readiness check is bounded');
  console.log('Hunt readiness checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
