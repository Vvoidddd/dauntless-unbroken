# Pangar frostbrand damage

The reported interaction concerns the Pangar **weapon passive** triggered by a
lantern hold. Its explosion actor selects six `DamageTable` rows:

| Rank | Timeout damage | Early-break damage |
| --- | ---: | ---: |
| 1 | 1000 | 1500 |
| 2 | 2000 | 3000 |
| 3 | 3000 | 4500 |

`PangarProcDamage` changes only those rows from `FrostDamage` to `DamageTrue`,
preserving their amounts. The engine still applies the original AoE hit division
and caller damage scale. Cooldown, brand health, weapon attacks, lantern damage
rows and cell definitions are untouched. This deliberately removes elemental
scaling/status contribution from the explosion as well as its normal damage
multiplier path; it is a flat-damage balance change.

The game-thread patch validates the row struct, all six names and expected
channel values before writing anything. It accepts its own already-patched
state. Unknown layouts or conflicting tuning are left alone. The diagnostic
`pangar_proc_flat_damage rows=6 changed=6` confirms activation in each new world.

## Verified pinned-game path

For the 1.4.4 executable SHA-256
`d3d41e614908d2befd518b27046d9822d6130ef12ba3504babbdb786bef9cff4`:

- `ce_mcrollin_weapon_aoe_bp` selects `Cell.McrollinRank1..3` or
  `Cell.McrollinSuccessRank1..3`. `aoe_base_bp` calls
  `ApplyArchonPointDamageFromTable`.
- Legacy implementation RVA `0x1356CC0` scales the 13 row channels, then calls
  `0x136CDD0` / `0x135BFF0`. Channel 2 becomes the SetByCaller `TrueDamage`
  magnitude at `0x135C30A`, `0x135C440` and `0x135C445`.
- The effect class loads `/Game/game/abilities/weapons/damage_ge.damage_ge_C`.
  Its cooked execution is `ArchonDamage`; its scoped modifier maps SetByCaller
  `TrueDamage` to `ArchonDamageAttributeSet.TrueDamage`.
- Legacy execution `0x12BB5E0` captures TRUE at `0x12BBB12..0x12BBB2A` and adds
  it at `0x12BD830`, after the eight-channel regular damage calculation at
  `0x1371600`. This is separate from the newer `ComputeDamage` API.

Revalidate those contracts when updating the executable or assets. The exact
reported build's one-shot behavior has not been reproduced in a player hunt.

## Rollout

This is a server-only DLL change; the stable launcher client DLL stays separate.
Use isolated canaries to check readiness, the mapped candidate hash and the
six-row activation diagnostic before installing the server artifact and pin.
Replacing the disk DLL affects newly started worlds. Occupied worlds keep their
mapped image and finish naturally; do not restart them to force the update.
