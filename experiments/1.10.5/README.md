# Dauntless Unbroken — 1.10.5

I'm working on getting 1.10.5 running for Unbroken. Everything here is being tested locally on my PC, on its own `1.10.5` branch. The live servers are still on 1.4.4.

I've paused this for now. Login and matchmaking work, but the game still kicks back to the main menu after the first cutscene, so it isn't ready to play yet. The local test services are stopped.

What I've got working so far:

- All 606 client files verified against build 365075's manifest.
- Fresh SDK generated from UE 4.26.2, changelist 365075.
- Dedicated Ramsgate world remains loaded and listens on `127.0.0.1:62770`.
- A separate `Local1105` test account can sign in to the local backend.
- The client passes the new data-migration response and reaches matchmaking.
- A real client connected to Ramsgate and advanced the native replication graph, then received a server-origin return-to-menu command during loading.

Still to do: finish loading into Ramsgate with a controllable character, get hunts working, sort out the 1.10.5 inventory and progression data, and handle existing player saves. Right now every local matchmaking request goes to the same Ramsgate instance, including tutorial requests. That's just for testing the connection.

Bounties and Slayer's Path aren't finished. Bounty boards are disabled in this test, and Journey reads return empty progress for the test account. Journey writes aren't implemented yet. Existing player saves haven't been migrated.

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

The lab game directory also needs the existing pinned `dxgi.dll` loader from `DauntlessUnbrokenLauncher/assets`; do not copy the 1.4.4 `DauntlessUnbroken.dll`. `start-server.ps1` installs the newly built experiment DLL only after confirming the lab game is closed.

Run each service in a separate terminal:

```powershell
node experiments/1.10.5/start-backend.cjs
node experiments/1.10.5/local-deploy.cjs
./experiments/1.10.5/start-server.ps1
node experiments/1.10.5/start-client.cjs --debug
```

For the unresolved return, add `--trace-travel` to the client command. Attach CDB to the isolated server PID with `-cf experiments/1.10.5/trace-server-return.cdb` to capture the initiating call stack. Run CDB from this checkout so that relative command-file path resolves. Trace logs must remain outside Git.

The last trace caught the server calling `UBountyComponent::ReturnToMainMenu` at RVA `0x189B6EF`, with `An error occurred. Please try again later.`, then Archon's return at `0x1B5FC70` and the client RPC. That's where I'll pick this back up: find out which Bounty request is failing. `POST /pjm/:accountId` also needs implementing. Its callback treats a completed HTTP request as success even when the response is 404, so Journey saves need a proper check too.

The backend creates a test account and private signing keys if they don't exist. The account ID is pinned to my original test account. If you start with a new test database, update `LOCAL_1105_ACCOUNT_ID`, the allocator whitelist and the check together, using only a test account. CDB is only needed with `--debug`. Debug output can include credentials, so keep those logs out of Git.

Checks to run with the local services up:

```powershell
node experiments/1.10.5/check-local-backend.cjs
./experiments/1.10.5/check-local-server.ps1
# After an actual client connection:
./experiments/1.10.5/check-local-server.ps1 -RequireConnection
```

## Notes for continuing the port

- Early engine startup overwrites `GIsServer/GIsClient`. Setting the globals only in `DllMain` caused repeated world loading. Exact-build guarded startup patches keep dedicated flags stable.
- `UWorld::Listen` is a false-return stub in this WindowsClient build. The hook replaces only the LoadMap call site, creates the named net driver and calls the verified `IpNetDriver::InitListen`; successful UDP binding is checked independently.
- The dynamic source level collection must also own the driver. `SetActiveLevelCollection` (`0x40712D0`) copies its driver back to `UWorld::NetDriver`; assigning the world alone was undone by the next collection switch.
- The lab server config enables `/Script/Archon.ArchonReplicationGraph`. Native InitListen creates it and SetWorld registers dispatch/flush delegates. WindowsClient TickFlush omits server replication, so the hook invokes the verified Archon graph once before native flush when a client is connected; it does not duplicate dispatch or the old manual actor loop.
- Server HTTP requests need the existing backend's game-server API-key header. The server-only Curl hook verifies exact build bytes and attaches a fresh lab-only credential solely to `http://127.0.0.1:62000/` URLs. Credentials remain outside Git. Backend authentication is not bypassed.
- `UPlayerJourneyComponent::OnQueryPlayerJourneyDataComplete` dereferences a null HTTP response at RVA `0x192a6bb`. The assembly guard enters the existing failure/cleanup path instead of returning past shared-pointer cleanup. It compiles; a forced-null runtime regression is still pending.
- 1.10.5 adds `/migration/trigger` (POST) and `/migration/status` (GET). Its response parser requires top-level boolean `migration_finished` and `migration_failed`. The older 167-endpoint map omitted these keys. The generator now incorporates packaged Phoenix endpoint keys and redirects them to loopback.
- Broad substring matching of MCP `Domain`/`Protocol` keys also changed URL paths and WebSocket schemes. The experiment matches exact keys and preserves `ws` for the STOMP transport. Chat/STOMP services are not implemented in this lab.
