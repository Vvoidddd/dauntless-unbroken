---
title: Weapon meters in 1.10.5
parent: Findings
nav_order: 18
description: "What the 1.10.5 server build exposes for weapon meters and how their replication path was repaired."
lang: en
ref: findings/weapon-meters-1105
---

# Weapon meters in 1.10.5
{: .no_toc }

Weapon-meter reports need a 1.10.5 hunt reproduction. The older 1.4.4 guides and community
descriptions are not enough to decide whether a meter is working in the current target build.

## What the repository contains

The checked-in `DauntlessUnbrokenInternalServer/SDK` is the older native-server SDK. Its history
starts with the 1.4.4 server skeleton, so its weapon headers cannot establish 1.10.5 behavior.
The 1.10.5 native bootstrap is built from a separate SDK generated from the pinned client
`dauntless_rel-1.10.5-CL-365075`; that SDK lives beside the game in the external build workspace
and is not committed to this repository.

The older headers still identify the kinds of state that need to be checked in the 1.10.5 SDK:

| Report | 1.10.5 class or data | What it exposes |
|---|---|---|
| Axe determination | `ArchonAxeAttributeSet` | Replicated `DeterminationMeter` and `DeterminationMeterMax` attributes. |
| Sword meter | `BP_EB_Weapon` and `weapon_meter_bpc` | The shared meter component, sword-charge state, meter-gain timers and sword-charge generation/removal. |
| Chain blades | `weapon_meter_bpc` and `FWeaponPowerTableData` | The shared meter component and the `CBlade_MeterGainScale` tuning field. |

In the older SDK, `weapon_meter_bpc` has separate functions for increasing, decreasing, filling,
emptying and decaying the meter. `BP_EB_Weapon` also has `HandleMeterGain`,
`StartMeterGainTimer`, `ResetMeterGain` and replicated sword-charge fields. Those names are useful
search targets, not evidence that the 1.10.5 Blueprint graph or tuning is identical. The 1.10.5
bootstrap source contains no meter-specific override or replacement formula. Its replication
workaround did, however, special-case hammers when fixing distance culling for equipped equipment.
Axe, sword and chain-blade weapon actors were left out even when marked always relevant. Commit
`6f122a83` removes that weapon-type restriction and applies the same distance-cull repair to every
equipped, live, always-relevant weapon actor. This preserves the authoritative Blueprint meter
logic while allowing its replicated state to reach the client.

## What this does not prove

The older headers prove only that the 1.4.4-era SDK had these concepts. They do not prove that a
particular 1.10.5 attack reaches the same paths, that a tuning value is nonzero at runtime, or that
the HUD receives the replicated value. The fix was compiled against the pinned 1.10.5 client SDK
and covered by a native policy test for live/always-relevant and destroyed/not-relevant actors. A
hunt reproduction was not run because the local lab already had a game process and the change was
kept away from its running state. Exact per-weapon gain amounts, attack tags and HUD presentation
still need a disposable-account hunt reproduction.

The repository's current 1.10.5 patch notes therefore keep weapon meters under investigation.
That status is more accurate than carrying over 1.4.4 assumptions such as a specific hit count,
charge amount or decay rate.

## Evidence needed for a code fix

Use a disposable account and record one weapon per hunt:

1. weapon and weapon part, hunt map and whether the hunt is Training Grounds or a live hunt;
2. attack or special used, target hit, and the meter value before and after the event;
3. whether the HUD changed, whether the special became available, and whether the value decayed;
4. exported support logs and the exact client/server build hashes.

A follow-up reproduction should use the generated 1.10.5 SDK to record one weapon per hunt and
confirm the authoritative meter value, replicated value and HUD presentation. It should not carry
1.4.4-era meter constants into 1.10.5 or replace the Blueprint gain rules.
