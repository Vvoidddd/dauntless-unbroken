import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { refreshWindowsShortcutIcons } from "../src/main/windows-icons";

test("refresh only this installation's existing shortcuts and leave launch details intact", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "unbroken-icons-"));
  try {
    const exe = "C:\\Apps\\Unbroken\\app-1.0.18\\DauntlessUnbrokenLauncher.exe";
    const icon = "C:\\Apps\\Unbroken\\app-1.0.18\\resources\\icon.ico";
    const entries = new Map([
      ["Desktop.lnk", { target: "c:\\apps\\unbroken\\DauntlessUnbrokenLauncher.exe", icon: "old.exe", args: "--safe-mode", appUserModelId: "keep-me" }],
      ["Renamed pin.lnk", { target: exe, icon: "old.exe" }],
      ["Current.lnk", { target: exe, icon, iconIndex: 0 }],
      ["Other.lnk", { target: "C:\\Apps\\Other\\DauntlessUnbrokenLauncher.exe", icon: "other.exe" }],
    ]);
    for (const name of [...entries.keys(), "Bad.lnk", "notes.txt"]) await writeFile(path.join(dir, name), "");
    await mkdir(path.join(dir, "Directory.lnk"));
    const updates: string[] = [], warnings: string[] = [];
    const shell = {
      readShortcutLink(file: string) {
        const details = entries.get(path.basename(file));
        if (!details) throw new Error("Invalid link");
        return details;
      },
      writeShortcutLink(file: string, op: "update", details: { target: string; icon: string; iconIndex: number }) {
        assert.equal(op, "update");
        assert.deepEqual(Object.keys(details).sort(), ["icon", "iconIndex", "target"]);
        assert.equal(details.target, entries.get(path.basename(file))!.target);
        Object.assign(entries.get(path.basename(file))!, details);
        updates.push(path.basename(file));
        return true;
      },
    };
    assert.equal(await refreshWindowsShortcutIcons([dir, dir, path.join(dir, "missing")], exe, icon, shell, s => warnings.push(s)), 2);
    assert.deepEqual(updates.sort(), ["Desktop.lnk", "Renamed pin.lnk"]);
    assert.equal(warnings.length, 1);
    assert.equal(entries.get("Desktop.lnk")!.args, "--safe-mode");
    assert.equal(entries.get("Desktop.lnk")!.appUserModelId, "keep-me");
    assert.equal(await refreshWindowsShortcutIcons([dir], exe, icon, shell, () => {}), 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a failed shortcut write does not stop the remaining repairs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "unbroken-icons-"));
  try {
    for (const name of ["a.lnk", "b.lnk"]) await writeFile(path.join(dir, name), "");
    const warnings: string[] = [];
    const exe = "C:\\Launcher\\app-1.0.18\\Launcher.exe";
    const changed = await refreshWindowsShortcutIcons([dir], exe, "new.ico", {
      readShortcutLink: () => ({ target: exe }),
      writeShortcutLink: file => path.basename(file) !== "a.lnk",
    }, s => warnings.push(s));
    assert.equal(changed, 1);
    assert.equal(warnings.length, 1);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
