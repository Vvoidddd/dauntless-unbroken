import {test} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(__dirname, "..", "..");
const renderer = readFileSync(path.join(ROOT, "src", "renderer", "index.ts"), "utf8");

test("profile settings show the friends-only audience and automatic safety policy", () => {
  assert.match(renderer, /Audience/);
  assert.match(renderer, /Accepted friends only/);
  assert.match(renderer, /Automatic content check/);
  assert.match(renderer, /icon\("people", "profile-policy-icon"\)/);
});
