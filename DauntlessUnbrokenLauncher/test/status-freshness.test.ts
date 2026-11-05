import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(__dirname, "..", "..");
const renderer = readFileSync(path.join(root, "src", "renderer", "index.ts"), "utf8");
const types = readFileSync(path.join(root, "src", "shared", "types.ts"), "utf8");
const controller = readFileSync(path.join(root, "src", "main", "controller.ts"), "utf8");

test("server status exposes and displays its last check time", () => {
  assert.match(types, /statusCheckedAt\?: string \| null/);
  assert.match(controller, /this\.statusCheckedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(renderer, /function statusCheckedLabel/);
  assert.match(renderer, /statusCheckedLabel\(state\.snap\)/);
  assert.match(renderer, /t\("connect_last_checked", \{ time: timeText \}\)/);
});
