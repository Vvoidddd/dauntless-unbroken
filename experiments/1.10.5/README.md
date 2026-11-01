# Dauntless Unbroken — 1.10.5

I'm getting 1.10.5 running for Unbroken in a separate local test. This branch stays separate from the live 1.4.4 servers.

Ramsgate now loads, and the first Slayer's Path quest completes, gives 100 Rams and saves its progress. Training Grounds has its own local server now, instead of matchmaking sending every request back to Ramsgate. Travel to the training map and Rosk's dialogue have both been confirmed in-game, with the next quest progressing in the saved character data.

I also fixed the shared dialogue lookup for characters whose grammatical gender hasn't been set. It uses the packaged neutral translation without changing the character's appearance. The first quest description and Rosk's later conversation have been confirmed in-game. The rest of the quest chain still needs testing.

Slayer's Path snapshots now save to the local database with version checks. Bounty boards are still disabled, and the local season17 configuration only supplies the dates needed to finish loading. Combat hunts, multiplayer and full save conversion aren't ready.

Void's imported inventory loads in-game. The old Slayer Mastery is still rank 37; the newer HUD shows weapon skill instead. Its stuck `8,888 / 100,000` was placeholder text because the backend was missing the packaged experience tracks. Those tracks are now included with the original 1.10.5 XP thresholds.

I'm starting migrated weapon skills at zero XP (level 1 in 1.10.5), regardless of old equipment rank. Gear, old Mastery, quests, island unlock records and tutorial progress stay intact. `migrate-experience.cjs` only inserts missing weapon tracks, so running it again never resets XP earned in the new version. I checked Void after the reset: his current quests and previously available islands are still accessible. That confirms this account's migration, not every possible save or the complete old quest-to-Slayer's Path mapping.

## Where I'm leaving it — 1 November

Ramsgate login, the first Markus quest (including its 100 Rams reward), Training Grounds travel and Rosk's dialogue have passed the local in-game checks. Void's belongings are present, and resetting weapon XP leaves his quests and islands available. The original live export is untouched; the test uses a separate database and account key.

Next up: combat hunts, multiplayer, the rest of the quest chain and more migrated accounts. The twelve unresolved item IDs and the old Gnasher axe rank still need checking. Bounty boards remain disabled. I also need to handle failed Journey saves on the native side before calling this ready for public use.

## In-game Update Notes

Unbroken's notes are in `DauntlessUnbrokenMetagame/src/routes/patchnotes1105.json`. They cover the local build, account progression, quest fixes and current limits. Edit that file and rebuild/restart the local backend to update the text. All language requests currently use the English copy. The HTTP response and isolation checks pass; the populated screen still needs a visual check in the next game session.

The game already requests `GET /patchnotes/en/365075_rel-1.10.5_shipping`; it was falling through to the unstubbed-route handler, leaving the built-in `1.6.3` placeholder screen. The new response uses the existing endpoint and widget, with no additional DLL hook. It only answers for this build when `LOCAL_1105_ACCOUNT_ID` is set and `BIND_HOST=127.0.0.1`.

For this exact client, the response is `{code, message, payload}`. The payload has `date` (an ISO date string), `description`, `language`, `permalink`, `release_version`, `title` and `notes`. Each note has `type`, `title` and `sections`; each section has `type`, `title`, `description`, `background`, `cta`, `url` and `changes`. Each change has a `comment` and a string `list`. The response serializer is at RVA `0xDD7590`, payload at `0x1AC15B0`, category at `0x1AC11F0`, section at `0x1AC19A0` and change at `0x1AC1180`. Recheck this contract if the client build changes.

Run the focused check from `DauntlessUnbrokenMetagame`:

```powershell
./node_modules/.bin/tsc.cmd -p tsconfig.test.json
node --test build/test/patchnotes1105.test.js
```

## Weapon XP migration

With the imported profile selected and the local client/world servers closed:

```powershell
node experiments/1.10.5/check-experience.cjs
node experiments/1.10.5/migrate-experience.cjs # preview
node experiments/1.10.5/migrate-experience.cjs --apply
```

The first apply keeps a private SQLite snapshot beside the imported database. Restart the local backend and worlds afterward to reload the progression configuration. The XP configurations come from the packaged `Gameplay/Experience` weapon, player and prestige track tables. The HUD now shows real levels in-game; migrated weapon skills start at zero XP.

## Test setup

My test folder is `C:\dr\build-1.10.5-20261030`, with the source in `repo`. The DLL checks `DR_1105_LOCAL_LAB=1`, that exact game path, and the executable SHA-256 below. These offsets are only for this build.

`41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd`

Game files, the generated SDK, keys, databases, logs and compiled test binaries stay out of Git. This setup uses its own configuration and test account. The migration response is currently a placeholder limited to `LOCAL_1105_ACCOUNT_ID`; it doesn't convert anyone's save.

## Building and running locally

Use the verified `Dauntless_1.10.5.365075.manifest` (SHA-1 `a31648745d9e41016aaa6ed9a16d1eabab85ec7d`) from [DauntlessManifestArchive](https://github.com/addison2k/DauntlessManifestArchive/blob/main/manifests/Windows/Dauntless_1.10.5.365075.manifest). Obtain the client separately. Place it under the lab's `game` directory, and its extracted `DefaultGame.ini` under `extracted-config`. Generate the SDK from this exact build using Dumper-7; the project expects `sdk/4.26.2-365075+++dauntless+rel-1.10.5-Archon/CppSDK` beside `repo`.

Build with Visual Studio 2022 Build Tools (v143, Windows SDK, MASM) and Python 3:

```powershell
python experiments/1.10.5/build-bootstrap.py
cd DauntlessUnbrokenMetagame
npm ci
npm run build
cd ..
```

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
./experiments/1.10.5/check-local-server.ps1
./experiments/1.10.5/check-local-server.ps1 -World dojo
# After an actual client connection:
./experiments/1.10.5/check-local-server.ps1 -RequireConnection
./experiments/1.10.5/check-local-server.ps1 -World dojo -RequireConnection
```

Use `check-local-backend.cjs --matchmaking` only while the game is closed, because it changes the account's travel request. The allocator accepts CITY and `SHARED / ShatteredIsles_TrainingDojo`; unsupported hunts fail explicitly instead of silently returning Ramsgate.

## Existing saves

Void's live account was exported read-only and copied to `backend-state/imported.db`. The original export, its checksum and both account keys remain outside Git. `import-account.py` refuses to overwrite an existing test copy, preserves raw character/inventory data and gives the local copy a disposable key. It doesn't change the live account or its key.

Run `node experiments/1.10.5/check-imported-account.cjs` before the imported character makes its first in-game save. It checks the original export checksum, normal backend authentication, exact character/inventory preservation and database integrity.

To test the imported account, stop the local game, both world servers, backend and allocator, then set `backend-state/selected-account.json` to `{"profile":"imported"}` and start them again. Use `{"profile":"synthetic"}` to return to Local1105. Friend and guild relationships are archived in the export but aren't installed in this single-account lab.

The catalog comparison found 925/928 instanced IDs and 1,729/1,738 stacked IDs in the 1.10.5 assets. That doesn't prove every item works. Twelve IDs remain unresolved, and `WP_GA_BEAVER` has an old level of 15 where the new catalog allows 0–1. Other weapons still use levels up to 15, so changing every item to level 1 would be wrong. Weapon experience and reforge tracks are separate from those item levels and are absent from this 1.4.4 save. Quest-to-Slayer's-Path conversion also remains unfinished. Nothing here is a production migration yet.

## Notes for continuing the port

- Early engine startup overwrites `GIsServer/GIsClient`. Setting the globals only in `DllMain` caused repeated world loading. Exact-build guarded startup patches keep dedicated flags stable.
- `UWorld::Listen` is a false-return stub in this WindowsClient build. The hook replaces only the LoadMap call site, creates the named net driver and calls the verified `IpNetDriver::InitListen`; successful UDP binding is checked independently.
- The dynamic source level collection must also own the driver. `SetActiveLevelCollection` (`0x40712D0`) copies its driver back to `UWorld::NetDriver`; assigning the world alone was undone by the next collection switch.
- The lab server config enables `/Script/Archon.ArchonReplicationGraph`. Native InitListen creates it and SetWorld registers dispatch/flush delegates. WindowsClient TickFlush omits server replication, so the hook invokes the verified Archon graph once before native flush when a client is connected; it does not duplicate dispatch or the old manual actor loop.
- Server HTTP requests need the existing backend's game-server API-key header. The server-only Curl hook verifies exact build bytes and attaches a fresh lab-only credential solely to `http://127.0.0.1:62000/` URLs. Credentials remain outside Git. Backend authentication is not bypassed.
- `UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete` dereferences a null HTTP response at RVA `0x192a6bb`. The assembly guard enters the existing failure/cleanup path instead of returning past shared-pointer cleanup. It compiles; a forced-null runtime regression is still pending.
- 1.10.5 adds `/migration/trigger` (POST) and `/migration/status` (GET). Its response parser requires top-level boolean `migration_finished` and `migration_failed`. The older 167-endpoint map omitted these keys. The generator now incorporates packaged Phoenix endpoint keys and redirects them to loopback.
- Broad substring matching of MCP `Domain`/`Protocol` keys also changed URL paths and WebSocket schemes. The experiment matches exact keys and preserves `ws` for the STOMP transport. Chat/STOMP services are not implemented in this lab.
