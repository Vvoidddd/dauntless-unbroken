# Behemoth part monitor preview

Launcher `1.0.35-damage.3` adds the optional Windows PartMonitor and a compact
left-side damage summary. Both mod cards credit Void. The team core total stays
visible on the left; individual teammate rows are a live setting, collapsed by
default. The right panel shows the closest living Behemoth within 50 m, with
small distance hysteresis to avoid switching constantly between two targets.
Outside that range it leaves the existing distant tracker unobstructed.

Each actual part has a name, status indicator and HP bar:

- Green / OK: more than 50% part HP.
- Orange / LOW: 50% or less.
- Red / BROKEN: replicated sever, Broken or Scarred state. The bar is empty.
- Gray: fixed/disabled or unavailable data; no invented health percentage.

The monitor reads `UMonsterPartComponent:GetCurrentHealth()/GetMaxHealth()` only
when its replicated MonsterPartActor is valid. It does not use expose/wound HP
or estimate health by subtracting combat-text damage. In the pinned executable,
component getters `0x1421820` and `0x1426990` forward through the part actor to
`0x12F8E90` and `0x12F91F0`. They read CurrentHealth/MaxHealth from the actor's
ArchonHealthAttributeSet. Both properties and ASC SpawnedAttributes have
unconditional replication parameters; the part actor enables replication and
always relevance. Invalid actor, invalid/nonfinite HP and nonpositive max HP
produce gray instead of green.

Cooked PartType values are 0 Normal, 1 Armored, 2 Severable, 3 Broken, 4 Scarred,
5 Disabled, 6 Exposed, 7 None. The blueprint `IsBroken()` only checks Scarred,
so the monitor explicitly handles 3/4 and PartSevered. A break-stage index alone
does not imply a break: armour can become normal flesh, and parts can regenerate.
Disabled is only red when the actual stage array proves the standard Armored
description (1) → Disabled description (7) transition. Unreadable stage entries
retain their positions. Generic disabled parts stay gray. Regrowth is polled
from current state rather than remembered as permanently broken.

Names come from PartName, a meaningful component name, then the cooked body-part
enum. The enum has no left/right distinction. Drask's BackLeft/BackRight and
Kharabak's FrontLeftWing/FrontRightWing are examples of actual cooked names.
Skarn armour and flesh are separate parts; deduplication uses shared health-actor
identity, never body-part type. Fixed core-body/kill components are omitted.

Both panels use shared native Image/text widgets. Brushes/fonts are set before
viewport construction; every widget is hit-test-invisible. The right monitor
uses opacity tag 0.994, distinct from damage 0.995, tracker 0.996, menu 0.997 and
lock-on 0.993. Six parts fit one column; seven or more use two compact columns,
with an explicit overflow count beyond sixteen. Positions are anchored to
opposite viewport edges and vertically relative to the centre.

`lua5.4 tests/client-mods/damage-meter.lua` checks the actual shipped adapters and
shared drawing helpers, including per-part HP bar widths, the exact half-health
boundary, false breakability, missing actors, duplicate shapes, regeneration,
armour lineage, same-map travel, ownership cleanup and input transparency.
Native in-game rendering and UE4SS parameter/property marshalling still require
a real-hunt smoke test; the Windows computer-use native pipe was unavailable.
The release remains a prerelease and does not replace stable auto-updates.
