import { lstat, open, readFile, unlink } from 'node:fs/promises';

const marker = 'Dauntless dashboard maintenance';

export async function drainStatus(flag) {
  try {
    const stat = await lstat(flag);
    if (!stat.isFile() || stat.isSymbolicLink()) return 'external';
    if (stat.size > 1024) return 'external';
    return await readFile(flag, 'utf8') === marker ? 'dashboard' : 'external';
  } catch (error) {
    if (error.code === 'ENOENT') return 'open';
    throw error;
  }
}

export async function startDrain(flag) {
  try {
    const file = await open(flag, 'wx', 0o600);
    try { await file.writeFile(marker); } finally { await file.close(); }
    return 'dashboard';
  } catch (error) {
    if (error.code === 'EEXIST') return drainStatus(flag);
    throw error;
  }
}

export async function stopDrain(flag) {
  const state = await drainStatus(flag);
  if (state === 'external') throw new Error('Drain belongs to another controller');
  if (state === 'dashboard') await unlink(flag);
  return 'open';
}
