# Dauntless Unbroken â€” 1.10.5

This is the current public realm. The folder still says `experiments` because that is where the port started; it is no longer a separate public test launcher.

Two EU hosts run the game. EU #2 also runs the shared backend and database; the UK host runs the key bot and keeps a verified backup. Paths, queue rules and the backup schedule are in [fleet operations](../../docs/operations/fleet-admission-backups.md).

## Accounts and progression

Players use their existing Unbroken account key. Legacy inventory, cosmetics, quests and unlock records are converted without writing back to the old database. Fresh accounts get the normal starting state, not a completed Slayer's Path or maxed Escalations. Migration must not replace progress already earned on 1.10.5.

Old Slayer Mastery and the weapon skill shown by 1.10.5 are different systems. `migrate-experience.cjs` inserts missing weapon tracks at zero XP, displayed as level 1, without overwriting existing tracks. Void confirmed his inventory, current quests and island access after conversion. That does not prove every old save is covered.

## Checks so far

- Ramsgate login, Markus's first quest and its 100 Rams reward, Training Grounds travel and Rosk's dialogue passed in-game checks.
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
