// A bounded search of normal install locations; never crawl the whole disk or modify a found game.
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { EXE_RELATIVE_PATH, PINNED_EXE_SHA256, PINNED_EXE_SIZE } from "./constants";
import { cleanGameFolderInput, gameRootCandidates, MAX_GAME_ROOT } from "./game-folder";
import { hashFile } from "./verify";

export async function fixedGameDrives(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "[IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Fixed' -and $_.IsReady } | ForEach-Object { $_.RootDirectory.FullName }"],
      { timeout: 5000, windowsHide: true, maxBuffer: 4096 });
    return stdout.split(/\r?\n/).filter(s => /^[A-Z]:\\$/i.test(s));
  } catch { return []; }
}

export async function discoverExistingGames(seeds: string[], platform = process.platform,
  pin = { size: PINNED_EXE_SIZE, sha256: PINNED_EXE_SHA256 }): Promise<string[]> {
  const p = platform === "win32" ? path.win32 : path.posix;
  const queue = seeds.map(dir => ({ dir, depth: 0 }));
  const seen = new Set<string>();
  const checked = new Set<string>();
  const found: string[] = [];
  const id = (s: string) => platform === "win32" ? s.toLowerCase() : s;
  // ponytail: common folders only, at most 100 directories/8 executable hashes; manual Browse covers unusual installs.
  let hashes = 0;
  for (let i = 0; i < queue.length && seen.size < 100 && hashes < 8; i++) {
    const { dir: input, depth } = queue[i];
    const dir = cleanGameFolderInput(input, platform);
    if (!dir || seen.has(id(dir))) continue;
    seen.add(id(dir));
    try { if (!(await fs.lstat(dir)).isDirectory()) continue; } catch { continue; }
    for (const root of gameRootCandidates(dir, platform)) {
      if (root.length > MAX_GAME_ROOT || checked.has(id(root))) continue;
      checked.add(id(root));
      const exe = p.join(root, ...EXE_RELATIVE_PATH.split("/"));
      try {
        const st = await fs.lstat(exe);
        if (!st.isFile() || st.size !== pin.size || hashes >= 8) continue;
        hashes++;
        if (await hashFile(exe) === pin.sha256) found.push(root);
      } catch { /* Missing, inaccessible or a different version. */ }
    }
    if (depth >= 3 || found.length >= 5) continue;
    try {
      const entries = await fs.opendir(dir);
      let n = 0;
      for await (const entry of entries) {
        if (++n > 500) break;
        if (entry.isDirectory() && /dauntless|basegame144|^games?$|^epic games$|^steam(?:apps)?$|^common$/i.test(entry.name))
          queue.push({ dir: p.join(dir, entry.name), depth: depth + 1 });
      }
    } catch { /* Discovery must not block installation on permissions errors. */ }
  }
  return found.slice(0, 5);
}
