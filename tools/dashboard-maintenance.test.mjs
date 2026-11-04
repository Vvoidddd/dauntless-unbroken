import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDrain, stopDrain, drainStatus } from './dashboard-maintenance.mjs';

test('dashboard drain preserves flags owned by other controls', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'unbroken-drain-'));
  const flag = join(dir, 'drain.flag');
  try {
    assert.equal(await drainStatus(flag), 'open');
    assert.equal(await startDrain(flag), 'dashboard');
    assert.equal(await readFile(flag, 'utf8'), 'Dauntless dashboard maintenance');
    assert.equal(await startDrain(flag), 'dashboard');
    assert.equal(await stopDrain(flag), 'open');
    await writeFile(flag, 'Dauntless CPU budget admission');
    assert.equal(await startDrain(flag), 'external');
    await assert.rejects(stopDrain(flag), /another controller/);
    assert.equal(await readFile(flag, 'utf8'), 'Dauntless CPU budget admission');
  } finally { await rm(dir, {recursive: true, force: true}); }
});

test('a linked drain flag is not followed or removed', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'unbroken-drain-link-'));
  const flag = join(dir, 'drain.flag');
  const target = join(dir, 'other');
  try {
    await writeFile(target, 'Dauntless dashboard maintenance');
    try { await symlink(target, flag); }
    catch (error) { if (error.code === 'EPERM') return t.skip('Creating symlinks is not permitted'); throw error; }
    assert.equal(await drainStatus(flag), 'external');
    await assert.rejects(stopDrain(flag), /another controller/);
    assert.equal(await readFile(target, 'utf8'), 'Dauntless dashboard maintenance');
  } finally { await rm(dir, {recursive: true, force: true}); }
});
