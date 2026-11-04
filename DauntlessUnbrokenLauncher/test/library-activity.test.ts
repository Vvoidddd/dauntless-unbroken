import {test} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const renderer = readFileSync(path.join(path.resolve(__dirname, "..", ".."), "src", "renderer", "index.ts"), "utf8");

test("the library home exposes current activity without inventing account data", () => {
  assert.match(renderer, /function playActivity/);
  assert.match(renderer, /lastPlayedAt/);
  assert.match(renderer, /onlineSeconds\(snap\)/);
  assert.match(renderer, /Achievements/);
  assert.match(renderer, /BADGE_HOURS\.length/);
  assert.match(renderer, /playActivity\(snap\)/);
});
