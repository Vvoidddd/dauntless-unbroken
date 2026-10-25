# Behemoth part monitor

Launcher `1.0.35` ships the optional Windows PartMonitor and a compact
left-side damage summary. Both mod cards credit Void and appear first on Client Mods.
The default left panel has five aligned value/label rows; the optional team view
adds the team core total and individual rows. The right panel shows the closest living Behemoth within 50 m, with
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

Both panels use shared native Image/text widgets. The cooked RobotoCondensed font
uses Regular labels and Bold values, without an outline. The previous version copied
the HP widget's bold font and added an outline. SetFont now explicitly refreshes
Slate after the reused chat widget is constructed. Tiny antialiased RGBA
textures provide a nine-slice rounded translucent panel and glow indicators, imported
using KismetRenderingLibrary.ImportFileAsTexture2D. No font glyph is used as a dot.
Every widget is hit-test-invisible and text clips to its assigned bounds. The right monitor
uses opacity tag 0.994, distinct from damage 0.995, tracker 0.996, menu 0.997 and
lock-on 0.993. Parts stay in one narrow column; larger anatomies use tighter rows,
with an explicit overflow count beyond sixteen. Positions are anchored to
opposite viewport edges and vertically relative to the centre.

`lua5.4 tests/client-mods/damage-meter.lua` checks the actual shipped adapters and
shared drawing helpers, including per-part HP bar widths, the exact half-health
boundary, false breakability, missing actors, duplicate shapes, regeneration,
armour lineage, same-map travel, ownership cleanup and input transparency.
Native in-game rendering and UE4SS parameter/property marshalling still require
a real-hunt smoke test; the Windows computer-use native pipe was unavailable.
The stable launcher release updates the normal feed; the HUD mods remain optional.

## 1.0.36 rendering correction

The real 1.0.35 screenshot showed white backdrops and square status indicators.
The cooked `StackableProgressBar` Construct event calls
`BoostIconBarImage.SetBrush(BoostIcon.Brush)`, replacing a brush assigned before
AddToViewport. Configure this Image only after viewport construction, following
the existing LockOn.MakeImage path. The health-bar mod's before-construction rule
applies to ProgressBar.WidgetStyle, not this Image. The HUD regression now resets
Image resource/tint/size during construction and requires the final textures to survive.

Lua `string.gsub` returns both text and replacement count. The formatter must
return only the text: forwarding both results as the final argument to `set()`
passed even zero as its truthy own-player colour flag, making damage values purple.
Numeric values retain their channel colours; only the team table highlights the local player.
