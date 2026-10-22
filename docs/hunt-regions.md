# World regions

The current fleet has two game hosts in one shared EU realm. The UK host runs the key bot, monitoring and database backup storage. There is no separate US game destination configured.

Choose **Automatic** or **EU** in launcher Settings. Launcher 1.0.21 hides Germany and US selections when the authenticated server reports regional mode disabled. Region availability refreshes in the background at most once per minute and is isolated when switching servers or accounts.

If an older saved selection receives `503 region_unavailable`, the launcher saves the shared EU preference and resets its local setting to Automatic before launching. Authentication failures, bans, maintenance responses and network errors do not trigger that retry. A full or temporarily unreachable enabled region is not treated as disabled.

## Optional regional workers

- `GET/POST /unbroken/api/HuntRegion` requires the player's account key. Valid preferences are `main`, `ger` and `us`; retired `aus` requests return `410 region_retired`.
- `GERMANY_REGION=1` or `US_REGION=1` enables that preference on the metagame. Keep these off unless the worker is configured and reachable.
- The main allocator uses `GERMANY_DEPLOYSERVER_URL` or `US_DEPLOYSERVER_URL`, each an HTTP loopback SSH tunnel. Configure the matching public-host validation and region probe settings as well.
- Keep `OVERFLOW_DEPLOYSERVER_URL` for the second shared EU host. A regional label does not create or geographically relocate a server.
- Include every enabled worker's private allowlist endpoint in the gateway feed. Backend routing alone does not admit players through the game UDP firewall.
- Cross-region parties follow their leader. Account data remains on the central backend. Public queues keep regions separate; ambiguous allocation failures must not create duplicate hunts.

## Hunt cleanup and admission

The watchdog checks every 15 seconds. `HUNT_MAX_AGE_MINUTES=120` bounds temporary hunt/tutorial lifetime. `HUNT_EMPTY_MINUTES=2` permits retirement after continuously fresh native zero-connection readings; telemetry gaps reset that timer. `HUNT_SILENT_MINUTES=15` retires a silent instance only when fresh telemetry from other instances proves host monitoring still works. `HUNT_UNREADY_GRACE_MINUTES=5` allows startup before occupancy retirement. Ramsgate and Training Grounds are exempt. Ports are released after the original child exits.

`GAMESERVER_CPU_GUARD=1` blocks new temporary processes above the configured CPU threshold, without evicting existing worlds. CPU, memory, hunt and port exhaustion use bounded capacity waits. `GAMESERVER_EXCLUDED_PORTS` removes known unreachable hunt ports from allocation for all players.

## Verification

A healthy allocator, a matchmaking assignment and a bound UDP socket do not prove player entry. Verify native connection counts and a real join on the affected route. Fleet totals are unavailable when a required host observation is stale.

When moving a game installation, verify the program filter on `DauntlessUnbroken-GamePorts-Allowlist` matches `GAMESERVER_BINARY_PATH`, as well as its UDP range and authenticated remote addresses. The allowlist helper preserves program filters. Never remove address restrictions to diagnose a region-selection error.

Disable a retired region's metagame flag and allocator URL together. Saved account preferences remain in the database and resolve to the shared EU pool while disabled. Drain occupied worlds before stopping a worker.
