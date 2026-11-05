import {test} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(__dirname, "..", "..");
const controller = readFileSync(path.join(ROOT, "src", "main", "controller.ts"), "utf8");

test("community news cooldown starts only after a current response succeeds", () => {
  assert.doesNotMatch(controller, /this\.newsCheckedAt = Date\.now\(\);\r?\n    try \{/);
  assert.match(controller, /if \(generation === this\.statusGen\) \{ this\.news = items; this\.newsCheckedAt = Date\.now\(\); this\.publish\(\); \}/);
});
