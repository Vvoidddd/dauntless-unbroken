import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { discoverExistingGames } from "../src/main/game-discovery";
import { EXE_RELATIVE_PATH } from "../src/main/constants";

test("discovery finds and deduplicates 1.4.4 without modifying files or accepting another version", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "unbroken-discovery-"));
  const data = "pinned game";
  const pin = { size: data.length, sha256: createHash("sha256").update(data).digest("hex") };
  const game = path.join(base, "Games", "BaseGame144", "Dauntless");
  const exe = path.join(game, ...EXE_RELATIVE_PATH.split("/"));
  const wrong = path.join(base, "DauntlessOther", ...EXE_RELATIVE_PATH.split("/"));
  try {
    await mkdir(path.dirname(exe), { recursive: true });
    await mkdir(path.dirname(wrong), { recursive: true });
    await writeFile(exe, data);
    await writeFile(wrong, "wrong files"); // same size, different hash
    assert.deepEqual(await discoverExistingGames([base, game, path.join(base, "missing"), "\\\\host.invalid\\share"], process.platform, pin), [game]);
    assert.equal(await readFile(exe, "utf8"), data);
    assert.equal(await readFile(wrong, "utf8"), "wrong files");
    assert.deepEqual(await discoverExistingGames([base]), [], "production pin refuses fixture executables");
  } finally { await rm(base, { recursive: true, force: true }); }
});

test("discovery ignores unrelated directory trees and unsupported network paths", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "unbroken-bounded-"));
  try {
    const nested = path.join(base, "unrelated", "Dauntless", ...EXE_RELATIVE_PATH.split("/"));
    await mkdir(path.dirname(nested), { recursive: true });
    await writeFile(nested, "x");
    assert.deepEqual(await discoverExistingGames([base], process.platform,
      { size: 1, sha256: createHash("sha256").update("x").digest("hex") }), []);
    assert.deepEqual(await discoverExistingGames(["\\\\host.invalid\\share", "C:relative"], "win32"), []);
  } finally { await rm(base, { recursive: true, force: true }); }
});
