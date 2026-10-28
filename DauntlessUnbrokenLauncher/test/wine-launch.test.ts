import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { GameProcess, gameDllOverrides, type SpawnFn } from "../src/main/launch";

test("direct Windows/Wine and native Linux launches request the native private-server proxy", async () => {
  for (const runtime of [undefined, { command: "proton", argsPrefix: ["run"], env: { WINEDLLOVERRIDES: "dxgi,d3d11=b;winmm=n" } }]) {
    let options: any;
    const child = new EventEmitter();
    const spawn = ((_command: string, _args: string[], opts: unknown) => {
      options = opts;
      setImmediate(() => child.emit("spawn"));
      return child;
    }) as unknown as SpawnFn;
    const before = process.env.WINEDLLOVERRIDES;
    await new GameProcess(spawn).start("/game/Win64", [], runtime, runtime ? undefined : { WINEDLLOVERRIDES: "dxgi=b;winmm=n", DR_SHOW_CONSOLE: "1" });
    assert.equal(options.env.WINEDLLOVERRIDES, runtime ? "d3d11=b;winmm=n;dxgi=n,b" : "winmm=n;dxgi=n,b");
    assert.equal(process.env.WINEDLLOVERRIDES, before, "do not mutate the launcher environment");
    if (runtime) assert.equal(runtime.env.WINEDLLOVERRIDES, "dxgi,d3d11=b;winmm=n");
    else assert.equal(options.env.DR_SHOW_CONSOLE, "1");
    child.emit("exit", 0);
  }
  for (const input of [undefined, "dxgi=b", "*DXGI.dll=b", "dxgi=n,b"]) {
    const value = gameDllOverrides(input);
    assert.equal(value, "dxgi=n,b");
    assert.equal(gameDllOverrides(value), value, "prefix preparation and launch can both apply it");
  }
});
