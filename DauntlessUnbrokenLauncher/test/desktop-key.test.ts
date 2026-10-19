import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { saveDesktopKey } from "../src/main/keystore";
import { extractAccountKey } from "../src/shared/username";

const opts = { key: "UUK_" + "a".repeat(48), username: "../Void", serverName: "Realm", host: "example.com", port: 443,
  fingerprint: "ab".repeat(32), date: new Date("2026-10-18T00:00:00Z") };

test("Desktop key recovery is readable/importable, idempotent and separate for rotated keys and realms", async () => {
  const desktop = await mkdtemp(path.join(tmpdir(), "unbroken-desktop-"));
  try {
    const file = await saveDesktopKey(desktop, opts);
    assert.equal(path.dirname(file), desktop);
    assert.equal(extractAccountKey(await readFile(file, "utf8")), opts.key);
    assert.ok(!(path.basename(file).includes(opts.key)));
    assert.equal(await saveDesktopKey(desktop, { ...opts, date: new Date("2026-10-19") }), file);
    const rotated = await saveDesktopKey(desktop, { ...opts, key: "UUK_" + "b".repeat(48) });
    const realm = await saveDesktopKey(desktop, { ...opts, host: "other.example.com" });
    assert.notEqual(rotated, file);
    assert.notEqual(realm, file);
    assert.equal((await readdir(desktop)).length, 3);
    await writeFile(file, "unrelated file");
    await assert.rejects(saveDesktopKey(desktop, opts), /collision/);
    assert.equal(await readFile(file, "utf8"), "unrelated file");
  } finally { await rm(desktop, { recursive: true, force: true }); }
});

test("Desktop save refuses non-file collisions and reports unavailable directories", async () => {
  const desktop = await mkdtemp(path.join(tmpdir(), "unbroken-desktop-"));
  try {
    const file = await saveDesktopKey(desktop, opts);
    await rm(file);
    await mkdir(file);
    await assert.rejects(saveDesktopKey(desktop, opts), /collision/);
    await assert.rejects(saveDesktopKey(path.join(desktop, "not-a-desktop"), opts));
  } finally { await rm(desktop, { recursive: true, force: true }); }
});
