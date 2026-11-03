# Escalation routing

The hosted allocator was missing all 18 normal Escalation destinations. It rejected those requests as `world_not_ported`, which made searches cancel before a server could start.

The hunt catalog now includes Shock, Blaze, Umbral, Terra, Frost and Radiant at all three difficulties. Routes come from build 365075's cooked player-hunt, matchmaker-hunt and Escalation specification tables. Radiant Heroic uses the case-sensitive matchmaker suffix `Glitter_heroic`; its specification is `Glitter_Heroic`.

Each destination was started separately on EU2's loopback address, outside public matchmaking. Read-only inspection of the running game verified the correct map, mission ID, Escalation mode component, four-player limit, five-round specification, game state and island director. Starting challenge ranges were 1–13, 10–50 and 51–90. The probe processes were stopped afterward. No native DLL replacement was needed.

`node experiments/1.10.5/check-local-deploy.cjs` checks all catalog destinations through the allocator, including the 18 Escalations and their difficulty metadata. The launcher script also passes the cooked atmosphere path.

This verifies routing and native initialization. Player entry, all five rounds, rewards and return travel still need end-to-end checks. Random Escalation patrols, Trials, missions and disabled/test destinations are not enabled by this change.

The live progression audit found no old 99999-level/XP stub states. Across 176 migrated accounts, weapon ranks ranged from 1 to 18, depending on weapon; legitimate earned progression was left intact. Void's six season responses returned levels 2, 0, 1, 8, 0 and 0.
