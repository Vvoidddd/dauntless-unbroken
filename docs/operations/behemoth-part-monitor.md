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
- Red / BROKEN: a confirmed break-stage description or sever. The bar is empty.
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

PartType is a resistance enum: Scarred(4) also represents healthy Body and
Unbreakable descriptions. Classification reads the current PartBreakData entry:
Broken(3), Scarred(4) and Broken_Regenerating(5) are actual breaks; Body(10) and
Unbreakable(11) are fixed. A forward Normal/Armored/Severable/Exposed damage-break
stage followed by Disabled is a confirmed break. Generic Disabled, including the
initial Disabled stage of quills, stays gray. Missing stage metadata with resistance
type4 is ambiguous and stays gray. Unreadable entries retain their positions.
Regrowth is polled from current state rather than remembered as permanently broken.

Kill/Body body-part types and Body descriptions are omitted from the anatomy list.
Some legacy core Body presets use normal stages with999x health, so filtering only
the Body description is insufficient. Skarn armour uses type12 and Funguy roots19;
they remain visible. Static evidence covers32archetypes,45variant assets,
295component templates,37part presets and24break presets. This is cooked-data
coverage, not a claim that every hunt was played.

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
Viewport layers are explicit: backdrop75, tracks76, fills77, text/indicators78.
Resizing a fill reapplies its position and anchors as well as its canvas size, so
the gray track cannot obscure it and it remains attached to the right-side panel.

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
