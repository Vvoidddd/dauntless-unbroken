import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PINNED_DLLS } from "../src/main/constants";

test("the proxy loader and shipped native DLL use the same Unbroken identity", () => {
  const assets = path.resolve(__dirname, "..", "..", "assets");
  const loader = readFileSync(path.join(assets, "dxgi.dll"));
  const name = "DauntlessUnbroken.dll";
  assert.ok(loader.includes(Buffer.from(name + "\0")), "LoadLibrary target must match the packaged DLL");
  assert.ok(!loader.includes(Buffer.from("UndauntedInternalServer.dll\0")), "the previous loader binding must not survive rebranding");
  assert.ok(PINNED_DLLS.some(dll => dll.name === name));
  assert.ok(existsSync(path.join(assets, name)));
});
