import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const controller = readFileSync(path.join(path.resolve(__dirname, "..", ".."), "src", "main", "controller.ts"), "utf8");

test("switching servers releases the previous session's art handles", () => {
  assert.match(controller, /this\.branding = null;/);
  assert.match(controller, /this\.art\.clear\(\);/);
});
