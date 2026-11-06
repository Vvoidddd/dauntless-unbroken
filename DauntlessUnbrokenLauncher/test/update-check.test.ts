import { test } from "node:test";
import assert from "node:assert/strict";
import { createUpdateCheck, UPDATE_POLL_MS } from "../src/main/update-check";

test("update checks throttle focus, defer while busy and never overlap", async () => {
  let now = 0, busy = true, calls = 0;
  let finish!: () => void;
  const check = createUpdateCheck(async () => {
    calls++;
    await new Promise<void>(resolve => { finish = resolve; });
  }, () => busy, () => now);
  assert.equal(UPDATE_POLL_MS, 300_000);
  await check();
  assert.equal(calls, 0);
  busy = false;
  const first = check();
  now = 120_000;
  await check();
  assert.equal(calls, 1);
  finish(); await first;
  const second = check();
  assert.equal(calls, 2);
  finish(); await second;
  now += 59_999;
  await check();
  assert.equal(calls, 2);
  now++;
  const third = check();
  assert.equal(calls, 3);
  finish(); await third;
});

test("failed checks release the guard but still respect the cooldown", async () => {
  let now = 0, calls = 0;
  const check = createUpdateCheck(async () => { calls++; throw Error("offline"); }, () => false, () => now);
  await assert.rejects(check, /offline/);
  await check();
  assert.equal(calls, 1);
  now = 60_000;
  await assert.rejects(check, /offline/);
  assert.equal(calls, 2);
});
