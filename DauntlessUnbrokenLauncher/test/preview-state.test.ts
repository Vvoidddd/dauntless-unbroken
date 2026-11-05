import {test} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(__dirname, "..", "..");
const renderer = readFileSync(path.join(ROOT, "src", "renderer", "index.ts"), "utf8");

test("the local preview publishes settings changes through its snapshot adapter", () => {
  assert.match(renderer, /const previewSnapshotListeners = new Set/);
  assert.match(renderer, /property === "onSnapshot"/);
  assert.match(renderer, /for \(const listener of previewSnapshotListeners\) listener\(PREVIEW_SNAPSHOT\)/);
  assert.doesNotMatch(renderer, /if\(PREVIEW_MODE\) return;\r?\n  api\.onWindowState/);
});

test("the local preview can reproduce the Linux launch failure surface", () => {
  assert.match(renderer, /PREVIEW_QUERY_MODE/);
  assert.match(renderer, /PREVIEW_LAUNCH_FAILED = PREVIEW_QUERY_MODE === "launch-failed"/);
  assert.match(renderer, /platform:PREVIEW_LAUNCH_FAILED \? "linux" : "win32"/);
  assert.match(renderer, /0x00000003: Proton or Wine could not find the game's launch path/);
});
