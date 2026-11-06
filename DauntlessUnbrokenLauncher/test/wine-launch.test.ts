import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { GameProcess, gameDllOverrides, type SpawnFn } from "../src/main/launch";
import { addSecret, setSink } from "../src/main/log";

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

test("Linux runtime output is captured after exit and redacted before logging", async () => {
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    pid: 1234,
  });
  const lines: string[] = [];
  setSink((line) => lines.push(line));
  const key = "UUK_" + "ab".repeat(24);
  addSecret(key);
  const spawn = ((_command: string, _args: string[], options: any) => {
    assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
    setImmediate(() => child.emit("spawn"));
    return child;
  }) as unknown as SpawnFn;
  const game = new GameProcess(spawn);
  await game.start("/game/Win64", [], { command: "proton", argsPrefix: ["run"], env: {}, captureOutput: true });
  child.stdout.write(`runtime key=${key}`);
  child.stderr.write("wine: failed to start executable\n");
  await new Promise<void>((resolve) => setImmediate(resolve));
  child.emit("exit", 3);
  assert.equal(lines.some((line) => line.includes("wine: failed to start executable")), true);
  assert.equal(lines.some((line) => line.includes(key) || line.includes(key.slice(4))), false);
  assert.equal(lines.some((line) => line.includes("<hidden>")), true);
});

test("Linux launch logs the runtime command and working directory", async () => {
  const child = Object.assign(new EventEmitter(), { pid: 1234 });
  const lines: string[] = [];
  setSink((line) => lines.push(line));
  const spawn = ((_command: string, _args: string[], _options: unknown) => {
    setImmediate(() => child.emit("spawn"));
    return child;
  }) as unknown as SpawnFn;
  const game = new GameProcess(spawn);
  await game.start("/home/deck/Games/Dauntless Unbroken/Archon/Binaries/Win64", ["server:61000"], {
    command: "/home/deck/.steam/root/compatibilitytools.d/GE-Proton/proton",
    argsPrefix: ["run"],
    env: {
      STEAM_COMPAT_DATA_PATH: "/home/deck/.local/share/DauntlessUnbroken/compat/proton",
      STEAM_COMPAT_INSTALL_PATH: "/home/deck/Games/Dauntless Unbroken",
    },
    captureOutput: true,
  });
  assert.ok(lines.some((line) => line.includes("launch runtime command: /home/deck/.steam/root/compatibilitytools.d/GE-Proton/proton run") && line.includes("Dauntless-Win64-Shipping.exe server:61000")));
  assert.ok(lines.some((line) => line.includes("launch working directory: /home/deck/Games/Dauntless Unbroken/Archon/Binaries/Win64")));
  assert.ok(lines.some((line) => line.includes("launch runtime paths: compat-data=/home/deck/.local/share/DauntlessUnbroken/compat/proton, install=/home/deck/Games/Dauntless Unbroken")));
  child.emit("exit", 3);
});
