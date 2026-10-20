# Ctrl+R mod refresh crash prevention

Launcher 1.0.12 disables UE4SS Lua-state hot reload and automatic script reload. Ctrl+R now opens/refreshed the existing mod menu and settings on its game-thread hook; it never requests a loader restart. Whole-mod on/off switches still persist to `mods.txt` and apply after restarting the game. Individual settings continue applying live.

## Why the behavior changed

The shipped configuration enabled native Ctrl+R reload. Several bundled scripts enqueue native game-thread callbacks during startup; unloading their Lua states while callbacks or hooks remain active is an unsafe boundary. The menu also used to execute UI callbacks directly on the input thread when no HUD tick was available. Refresh now uses its existing bounded Lua action queue and waits for the HUD hook instead.

Upstream reports describe crashes from overlapping deferred callbacks ([UE4SS #1180](https://github.com/UE4SS-RE/RE-UE4SS/issues/1180)) and unsafe asynchronous engine access ([UE4SS #1456](https://github.com/UE4SS-RE/RE-UE4SS/issues/1456)). These support avoiding that lifecycle; they do not prove the exact stack trace of the reported player crashes. No matching player crash dump was available for this change.

## Existing installations

Changing the bundled INI alone would miss existing players because it is a kept preference file. Both launcher and friend-kit setup now force only `EnableHotReloadSystem` and `EnableAutoReloadingLuaMods` to `0` in `[General]`, including duplicate entries and absent defaults. Other settings, comments, mod choices and key preferences remain. The migration runs before game launch; players must fully close the game, update the launcher, and launch again.

## Validation and scope

- Launcher: 336 tests passed, three platform skips. Tests cover the actual kept-INI update, repeated installation, section isolation, duplicate/missing keys, and parity with the friend-kit PowerShell function.
- Lua 5.4: all bundled scripts compile. The actual menu script, with mocked engine bindings, accepts Ctrl+R only with Control, performs no input-thread object access, bounds 1,000 presses to eight pending actions, and dispatches no new native callbacks when refreshing.
- All 47 bundled files match their manifest sizes and SHA-256 hashes.

This is client crash prevention, not a server or account change. Native hot reload is deliberately disabled rather than advertised as repaired. A real game-session confirmation is still needed; mocked engine tests cannot prove every Unreal widget or loader interaction is safe.
