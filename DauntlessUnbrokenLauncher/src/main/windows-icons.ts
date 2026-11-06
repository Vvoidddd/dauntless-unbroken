import { readdir } from "node:fs/promises";
import path from "node:path";

interface ShortcutShell {
  readShortcutLink(file: string): { target: string; icon?: string; iconIndex?: number };
  writeShortcutLink(file: string, operation: "update", details: { target: string; icon: string; iconIndex: number }): boolean;
}

// Squirrel's stable stub path stays the same across upgrades, so Explorer can keep
// its old cached icon. Point existing shortcuts at this version's ICO instead.
// Keep targets, arguments, AppUserModelIDs and the user's deleted shortcuts intact.
export async function refreshWindowsShortcutIcons(
  directories: string[], executable: string, icon: string, shell: ShortcutShell,
  warn: (message: string) => void,
): Promise<number> {
  const same = (a: string, b: string) => path.win32.resolve(a).toLowerCase() === path.win32.resolve(b).toLowerCase();
  const stub = path.win32.resolve(path.win32.dirname(executable), "..", path.win32.basename(executable));
  let changed = 0;
  for (const directory of new Set(directories)) {
    let files;
    try { files = await readdir(directory, { withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") warn(`Cannot read shortcut directory: ${directory}`);
      continue;
    }
    for (const file of files) {
      if (!file.isFile() || !file.name.toLowerCase().endsWith(".lnk")) continue;
      const shortcut = path.join(directory, file.name);
      try {
        const details = shell.readShortcutLink(shortcut);
        if (!same(details.target, stub) && !same(details.target, executable)) continue;
        if (details.icon && same(details.icon, icon) && details.iconIndex === 0) continue;
        if (!shell.writeShortcutLink(shortcut, "update", { target: details.target, icon, iconIndex: 0 })) throw new Error("Shortcut update failed");
        changed++;
      } catch { warn(`Cannot refresh shortcut icon: ${shortcut}`); }
    }
  }
  return changed;
}
