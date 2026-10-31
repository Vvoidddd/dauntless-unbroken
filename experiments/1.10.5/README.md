# Dauntless Unbroken 1.10.5 local server experiment

Work in progress on branch `1.10.5`. This is not a release or a replacement for the 1.4.4 fleet.

Validated locally on October 30, 2026:

- All 606 client files verified against build 365075's manifest.
- Fresh SDK generated from UE 4.26.2, changelist 365075.
- Dedicated Ramsgate world remains loaded and listens on `127.0.0.1:62770`.
- A synthetic `Local1105` account signs in against the loopback backend.
- The client passes the new data-migration response and reaches matchmaking.

Still incomplete: joining/possession/replication, playable hunts, 1.10.5 progression and inventory contracts, and migration of existing player saves. The local allocator intentionally sends the synthetic account to the existing Ramsgate world even for a tutorial request, solely to test network entry. It is not a hunt allocator.

## Isolation

This checkpoint is deliberately locked to `C:\dr\build-1.10.5-20261030`. The checkout is its `repo` subdirectory. The DLL requires `DR_1105_LOCAL_LAB=1`, that exact game path, and the executable SHA-256 below. A different binary must be analyzed before changing offsets.

`41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd`

Game files, generated SDK, account keys, databases, logs and compiled experiment binaries are not committed. Live server configuration and saves are not used. The migration response is a no-op fixture restricted by `LOCAL_1105_ACCOUNT_ID` to the fresh synthetic test account; it does not convert player saves.

## Local prerequisites and commands

Use the verified `Dauntless_1.10.5.365075.manifest` (SHA-1 `a31648745d9e41016aaa6ed9a16d1eabab85ec7d`) from [DauntlessManifestArchive](https://github.com/addison2k/DauntlessManifestArchive/blob/main/manifests/Windows/Dauntless_1.10.5.365075.manifest). Obtain the client separately. Place it under the lab's `game` directory, and its extracted `DefaultGame.ini` under `extracted-config`. Generate the SDK from this exact build using Dumper-7; the project expects `sdk/4.26.2-365075+++dauntless+rel-1.10.5-Archon/CppSDK` beside `repo`.

Build with Visual Studio 2022 Build Tools (v143, Windows SDK, MASM) and Python 3:

```powershell
python experiments/1.10.5/build-bootstrap.py
cd DauntlessUnbrokenMetagame
npm ci
npm run build
cd ..
```

The lab game directory also needs the existing pinned `dxgi.dll` loader from `DauntlessUnbrokenLauncher/assets`; do not copy the 1.4.4 `DauntlessUnbroken.dll`. `start-server.ps1` installs the newly built experiment DLL only after confirming the lab game is closed.

Run each service in a separate terminal:

```powershell
node experiments/1.10.5/start-backend.cjs
node experiments/1.10.5/local-deploy.cjs
./experiments/1.10.5/start-server.ps1
node experiments/1.10.5/start-client.cjs --debug
```

The backend creates a fresh test account and private signing keys when absent. This checkpoint's fixture account ID is pinned to the original lab account; a new lab database requires updating `LOCAL_1105_ACCOUNT_ID`, the allocator whitelist and the check together. Never use a real player's ID to make migration appear successful. CDB is optional unless `--debug` is supplied; debug output can contain local credentials and must stay outside Git.

Contract check against the running local backend:

```powershell
node experiments/1.10.5/check-local-backend.cjs
```

## Native findings

- Early engine startup overwrites `GIsServer/GIsClient`. Setting the globals only in `DllMain` caused repeated world loading. Exact-build guarded startup patches keep dedicated flags stable.
- `UWorld::Listen` is a false-return stub in this WindowsClient build. The hook replaces only the LoadMap call site, creates the named net driver and calls the verified `IpNetDriver::InitListen`; successful UDP binding is checked independently.
- `UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete` dereferences a null HTTP response at RVA `0x192a6bb`. The assembly guard enters the existing failure/cleanup path instead of returning past shared-pointer cleanup. It compiles; a forced-null runtime regression is still pending.
- 1.10.5 adds `/migration/trigger` (POST) and `/migration/status` (GET). Its response parser requires top-level boolean `migration_finished` and `migration_failed`. The older 167-endpoint map omitted these keys. The generator now incorporates packaged Phoenix endpoint keys and redirects them to loopback.
- Broad substring matching of MCP `Domain`/`Protocol` keys also changed URL paths and WebSocket schemes. The experiment matches exact keys and preserves `ws` for the STOMP transport. Chat/STOMP services are not implemented in this lab.
