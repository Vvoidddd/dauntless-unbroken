# Dauntless Unbroken â€” 1.10.5

This is the current public realm. The folder still says `experiments` because that is where the port started; it is no longer a separate public test launcher.

Two EU hosts run the game. EU #2 also runs the shared backend and database; the UK host runs the key bot and keeps a verified backup. Paths, queue rules and the backup schedule are in [fleet operations](../../docs/operations/fleet-admission-backups.md).

## Accounts and progression

Players use their existing Unbroken account key. Legacy inventory, cosmetics, quests and unlock records are converted without writing back to the old database. Fresh accounts get the normal starting state, not a completed Slayer's Path or maxed Escalations. Migration must not replace progress already earned on 1.10.5.

Old Slayer Mastery and the weapon skill shown by 1.10.5 are different systems. `migrate-experience.cjs` inserts missing weapon tracks at zero XP, displayed as level 1, without overwriting existing tracks. Void confirmed his inventory, current quests and island access after conversion. That does not prove every old save is covered.

## Checks so far

- Ramsgate login, Markus's first quest and its 100 Rams reward, Training Grounds travel and Rosk's dialogue passed in-game checks.
- In a local Training Grounds test, the starter hammer appeared and worked after its equipped weapon's per-connection replication distance limit was cleared. The server change applies that correction to always-relevant equipped hammers. Multiplayer and other hammer variants have not been checked.
- Void entered Hunting Grounds and killed two Behemoths. The backend received inventory and weapon XP saves.
- All 18 Escalation variants passed startup checks. DR_AGON confirmed entering one; full rounds, rewards and return travel still need completion tests.
- Public matchmaking shares eligible hunts. Private requests keep solo players or their party separate. Reservations count the whole party against capacity.
- Empty worlds retire using fresh occupancy samples and travel reservations. Ramsgate fills available seats before another city starts.
- Shop cards now read the same Rams price as the purchase screen. Forgemaster Hammer showed 2,500 Rams on both screens; no purchase was made.
- Main-shop offers rotate weekly. Recruit dye stays available for the quest. Middleman recipe times are set to one hour on client and host.
- New loadouts start without an Omnicell. Creating a loadout no longer equips an unearned Revenant; saved equipment is preserved.
- Slayer Link pools now use the 1.10.5 reward table. The repair restored 32 missing pools across 17 links without changing their XP, dates or existing rolls. A second pass made no changes.
- Database backups are verified before older copies are removed. Player saves happen during play, not only at backup time.

## Still being checked

Startup checks do not prove every hunt can be completed. Trials and unsupported story routes fail explicitly instead of sending players to the wrong world. Escalation completion, Slayer Link reward display and claims, some weapon abilities, zero-health states and Lightbound Koshai's invisible effects remain on the gameplay check list.

An already-starting hunt waits briefly for its existing readiness checks within the allocation request. If it becomes ready in that window, the same request returns its address instead of waiting for a later matchmaking poll. The latest server heartbeat must also show an initialized replication graph; an open UDP port and a fresh heartbeat alone are not enough. The wait is bounded, preserves the existing capacity checks, and does not establish that the client finished loading.

Live checks found Bastion equipped and Iceborne charging. Characters without an Omnicell actor in that sample also had an empty saved active slot. A check of 4,034 saved loadout revisions found no populated Omnicell slot being cleared. That does not explain every disappearing HUD slot; capture the active loadout, role and ability state during a failure before changing loadouts.

## Native build

Use build 365075 from [DauntlessManifestArchive](https://github.com/addison2k/DauntlessManifestArchive/blob/main/manifests/Windows/Dauntless_1.10.5.365075.manifest). Manifest SHA-1: `a31648745d9e41016aaa6ed9a16d1eabab85ec7d`.

Pinned `Dauntless-Win64-Shipping.exe` SHA-256:

```
41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd
```

The build workspace has `repo`, `game`, `extracted-config/DefaultGame.ini` and `sdk/4.26.2-365075+++dauntless+rel-1.10.5-Archon/CppSDK` as siblings. Generate the SDK from this exact client. Use Python 3 and Visual Studio 2022 Build Tools with v143, Windows SDK and MASM:

```powershell
python experiments/1.10.5/build-bootstrap.py
python experiments/1.10.5/check-gameclient-init.py
```

The client bootstrap repairs an empty XMPP server address and domain using the launcher-selected host and `DR_1105_XMPP_PORT`. The isolated lab defaults to port 62099; the normal launcher supplies its selected chat port. It leaves an already configured address and domain unchanged. This hook is limited to the verified 365075 client build. Run `python experiments/1.10.5/check-presence-login.py <game-exe>` to verify the hook target; `test-presence-address.cpp` checks the address selection without the game.

The lab game directory also needs the existing pinned `dxgi.dll` loader from `DauntlessUnbrokenLauncher/assets`; do not copy the 1.4.4 `DauntlessUnbroken.dll`. `start-server.ps1` installs a rebuilt DLL only while the lab game and servers are closed. It can start the second world while the first is running if the installed DLL matches the build.

Run each service in a separate terminal:

```powershell
node experiments/1.10.5/start-backend.cjs
node experiments/1.10.5/local-deploy.cjs
./experiments/1.10.5/start-server.ps1
./experiments/1.10.5/start-server.ps1 -World dojo
node experiments/1.10.5/start-client.cjs --debug
```

For travel debugging, add `--trace-travel` to the client command. Attach CDB to the isolated server PID with `-cf experiments/1.10.5/trace-server-return.cdb` to capture the initiating call stack. Run CDB from this checkout so that relative command-file path resolves. Trace logs must remain outside Git.

The loading return was caused by Bounty initialization asking for season17's missing dates. Supplying the local fixture fixed that return. The native Journey save callback ignores HTTP status, so a rejected save still needs native retry handling; server-side validation alone doesn't resolve that client behavior.

The backend creates a test account and private signing keys if they don't exist. `lab-account.cjs` selects the account and database for the backend, client and allocator. Its synthetic account ID is pinned to this lab; change that default if rebuilding the lab from an empty database. CDB is only needed with `--debug`. Debug output can include credentials, so keep those logs out of Git.

Checks to run with the local services up:

```powershell
node experiments/1.10.5/check-local-backend.cjs
node experiments/1.10.5/check-local-deploy.cjs
node experiments/1.10.5/check-stale-readiness.cjs
node experiments/1.10.5/test-hunt-readiness.cjs
node experiments/1.10.5/test-hunt-start.cjs
./experiments/1.10.5/check-local-server.ps1
./experiments/1.10.5/check-local-server.ps1 -World dojo
# After an actual client connection:
./experiments/1.10.5/check-local-server.ps1 -RequireConnection
./experiments/1.10.5/check-local-server.ps1 -World dojo -RequireConnection
```

Use `check-local-backend.cjs --matchmaking` only while the game is closed, because it changes the account's travel request. The allocator accepts CITY, `SHARED / ShatteredIsles_TrainingDojo` and catalogued Hunting Grounds; unsupported hunts fail explicitly instead of silently returning Ramsgate.

## Existing saves

Void's live account was exported read-only and copied to `backend-state/imported.db`. The original export, its checksum and both account keys remain outside Git. `import-account.py` refuses to overwrite an existing test copy, preserves raw character/inventory data and gives the local copy a disposable key. It doesn't change the live account or its key.

Run `node experiments/1.10.5/check-imported-account.cjs` before the imported character makes its first in-game save. It checks the original export checksum, normal backend authentication, exact character/inventory preservation and database integrity.

To test the imported account, stop the local game, both world servers, backend and allocator, then set `backend-state/selected-account.json` to `{"profile":"imported"}` and start them again. Use `{"profile":"synthetic"}` to return to Local1105. Friend and guild relationships are archived in the export but aren't installed in this single-account lab.

The catalog comparison found 925/928 instanced IDs and 1,729/1,738 stacked IDs in the 1.10.5 assets. That doesn't prove every item works. Twelve IDs remain unresolved, and `WP_GA_BEAVER` has an old level of 15 where the new catalog allows 0–1. Other weapons still use levels up to 15, so changing every item to level 1 would be wrong. Weapon experience and reforge tracks are separate from those item levels and are absent from this 1.4.4 save. Quest-to-Slayer's-Path conversion also remains unfinished. Nothing here is a production migration yet.
Do not install the 1.4.4 DLL. `start-server.ps1` refuses a new world when the built and installed DLL hashes differ; stage both together. Existing processes keep their loaded DLL until they exit.

A local lab needs its own database, keys, game profile and ports. The old `start-client.cjs`, selected-account fixtures and research scripts are development tools, not the public launcher. Never point them at production player data.

## Update Notes

The game reads `/patchnotes/en/365075_rel-1.10.5_shipping`. Edit `DauntlessUnbrokenMetagame/src/routes/patchnotes1105.json` and run its patch-notes test before publishing. Keep confirmed changes separate from issues under investigation.

## Porting notes

- Engine startup overwrote dedicated flags set only in `DllMain`. The startup guards are specific to this executable.
- `InitListen` and the level collections must share the correct net driver. Native `ArchonReplicationGraph` replication runs before the client build's `TickFlush`, which otherwise omits the server replication step.
- Server HTTP requests use the game-server API-key header. The server-only Curl hook adds it only for the configured loopback backend. Secrets stay outside Git.
- The Journey null-response guard takes the native failure/cleanup path; returning early would skip shared-pointer cleanup.
- Match MCP endpoint keys exactly. Broad matching of `Domain` or `Protocol` changed URL paths and WebSocket schemes.
- The offer map at `0x190` uses byte enum keys; the FName-keyed map is at `0x1e0`. Treating the enum as an FName crashed while formatting the name. The Rams card fix reads the verified enum map and borrows engine-owned price text.
