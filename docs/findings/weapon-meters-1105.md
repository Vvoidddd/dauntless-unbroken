---
title: Weapon meters in 1.10.5
parent: Findings
nav_order: 18
description: "What the 1.10.5 server build exposes for axe determination, sword charges and chain-blade meter gain, and what is still unverified."
lang: en
ref: findings/weapon-meters-1105
---

# Weapon meters in 1.10.5
{: .no_toc }

Weapon-meter reports need a 1.10.5 hunt reproduction. The older 1.4.4 guides and community
descriptions are not enough to decide whether a meter is working in the current target build.

## What the target build contains

The generated 1.10.5 server SDK contains the gameplay paths for all three reports:

| Report | 1.10.5 class or data | What it exposes |
|---|---|---|
| Axe determination | `ArchonAxeAttributeSet` | Replicated `DeterminationMeter` and `DeterminationMeterMax` attributes. |
| Sword meter | `BP_EB_Weapon` and `weapon_meter_bpc` | The shared meter component, sword-charge state, meter-gain timers and sword-charge generation/removal. |
| Chain blades | `weapon_meter_bpc` and `FWeaponPowerTableData` | The shared meter component and the `CBlade_MeterGainScale` tuning field. |

`weapon_meter_bpc` has separate authoritative functions for increasing, decreasing, filling,
emptying and decaying the meter. `BP_EB_Weapon` also has `HandleMeterGain`,
`StartMeterGainTimer`, `ResetMeterGain` and the replicated sword-charge fields. These are game
Blueprint functions in the 1.10.5 build; the native DLL does not replace them with a server-side
formula.

## What this does not prove

The headers prove that the target build has the meter state and callable gameplay paths. They do
not prove that a particular attack reaches those paths, that a tuning value is nonzero at runtime,
or that the HUD receives the replicated value. No local game installation was available for a
controlled axe, sword and chain-blade hunt, so this investigation did not reproduce the report and
does not claim a fix.

The repository's current 1.10.5 patch notes therefore keep weapon meters under investigation.
That status is more accurate than carrying over 1.4.4 assumptions such as a specific hit count,
charge amount or decay rate.

## Evidence needed for a code fix

Use a disposable account and record one weapon per hunt:

1. weapon and weapon part, hunt map and whether the hunt is Training Grounds or a live hunt;
2. attack or special used, target hit, and the meter value before and after the event;
3. whether the HUD changed, whether the special became available, and whether the value decayed;
4. exported support logs and the exact client/server build hashes.

A code change should follow a captured failure through the authoritative meter function. Until that
evidence exists, changing the native DLL or inventing 1.4.4-era meter constants would risk masking
the actual asset, replication or attack-tag problem.
