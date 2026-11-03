# Shared worlds and migration

Ramsgate now fills the busiest available instance to 20 before starting the other host. Training Grounds follows the same rule with 12 seats. Arrival reservations count towards capacity. Empty shared worlds retire after 190 seconds without players or reservations; missing telemetry never counts as empty. The supervisor no longer recreates these worlds immediately after cleanup.

The live rollout closed the old empty Ramsgate and dojo processes on both EU hosts and retained occupied hunts. A subsequent arrival started a fresh Ramsgate with four players. Process removal checks the executable, port and fresh native occupancy immediately before stopping. Windows tasks run under another user, so `Stop-Process` needs `-Force` after those checks.

EthernalDauntles' launcher reports contained `Migrated inventory is missing`. The old database contained seven characters without inventory rows; that backend creates inventory lazily. Migration now creates an empty inventory only when absent, inside the existing transaction. Existing items and the one-time 200 combat-merit grant are preserved. The gateway change is live; the player has not retested yet.

Checks: 18 CityPool tests; shared-world cold start, overflow, concurrent arrivals, retirement and lease protection; all catalog island allocation routes; migration rollback, repeated login, missing inventory and existing inventory preservation.

The live progression audit found no 99999 Escalation stub states and no progress tracks at the old 9999999 sentinel. Void's six season responses returned levels 2, 0, 1, 8, 0, 0. Existing earned level-25 seasons were left intact.

Hunt coverage is still incomplete. The allocator recognizes 23 Hunting Grounds catalog entries plus Tutorial, Ramsgate and Training Grounds. Escalation, Trials and mission routes still require native initialization and end-to-end travel/combat/reward checks. Passing allocation tests does not prove those modes work.
