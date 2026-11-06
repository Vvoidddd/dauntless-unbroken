import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

test("the shipped client DLL contains the native Trials schedule patch", () => {
  const assets = path.resolve(__dirname, "..", "..", "assets");
  const dll = readFileSync(path.join(assets, "DauntlessUnbroken.dll"));

  assert.ok(dll.includes(Buffer.from("verified_exact_1.10.5_build")), "client DLL is not the pinned 1.10.5 bootstrap");
  assert.ok(dll.includes(Buffer.from("local_client_endpoints_enabled")), "client DLL is missing the 1.10.5 login hooks");
  assert.ok(dll.includes(Buffer.from("gen_arena_hunts_schedule")), "client DLL is missing the Trials schedule table hook");
  assert.ok(dll.includes(Buffer.from("trials_schedule")), "client DLL is missing Trials schedule diagnostics");
});
