# Behemoth part monitor

Launcher `1.0.38` ships the optional Windows PartMonitor and a compact
left-side damage summary. Both mod cards credit Void and appear first on Client Mods.
The default left panel has five aligned value/label rows; the optional team view
adds the team core total and individual rows. The right panel shows up to two living Behemoths within 50 m,
each under its localized marker name, separated by a divider. Retained targets have a 70 m exit
range; their order stays stable when they move.
Outside that range it leaves the existing distant tracker unobstructed.

Each actual part has a name, status indicator and HP bar:

- Green / OK: more than 50% part HP.
- Orange / LOW: 50% or less.
- Red / BROKEN: a confirmed break-stage description or sever. The bar is empty.
- Gray: fixed/disabled or unavailable data; no invented health percentage.

Wounds change only a nonempty HP fill to red, leaving the indicator's HP/break colour intact.
The replicated `ExposedPartType == 6` is the wound flag; `IsExposed()` merely checks expose HP
and can misclassify an uninitialized zero. Polling the replicated flag restores the ordinary
fill after expiry. No local wound timer or wound-HP estimate is used.

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

Kharabak's FrontLeftWing/FrontRightWing are temporary Aether pools. Cooked Scissors state events
force their Normal→Disabled transition both on damage and when Aether mode ends; stage changes
also heal their raw HP to max. Positive raw HP therefore cannot distinguish a break from an
inactive wing. Only actual Scissors subclasses and their exact wing component references use
the owner's replicated `AetherCharged` flag (native `IsAetherCharged()` fallback): Disabled plus
false is inactive gray, true is broken, unreadable is unknown gray. Active Normal wings use
actual current/max HP. Other Behemoths retain the generic break policy.

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
lock-on 0.993. All parts stay visible in one column, without pagination or truncation;
larger anatomies use tighter rows and move upward/left beside the native danger HUD. Positions are anchored to
opposite viewport edges and vertically relative to the centre.
Viewport layers are explicit: backdrop75, tracks76, fills77, text/indicators78.
Resizing a fill reapplies its position and anchors as well as its canvas size, so
the gray track cannot obscure it and it remains attached to the right-side panel.

`lua5.4 tests/client-mods/damage-meter.lua` checks the actual shipped adapters and
shared drawing helpers, including per-part HP bar widths, the exact half-health
boundary, false breakability, missing actors, duplicate shapes, regeneration,
armour lineage, same-map travel, ownership cleanup and input transparency.
It also checks independent dual groups, same-species headings, wounded fill versus dot colour,
inactive/active Aether wings, all forty synthetic part rows, movement without new widgets,
dead/hidden pooled actors, and replacement on the next Escalation round.
Native in-game rendering and UE4SS parameter/property marshalling still require
a real-hunt smoke test; the Windows computer-use native pipe was unavailable.
The stable launcher release updates the normal feed; the HUD mods remain optional.

## 1.0.39 game-thread discovery correction

The former lock-on key poll called `FindAllOf("ArchonPlayerController")` every frame even
while unlocked; the tracker repeated boss/controller discovery every 60 ms. PartMonitor also
walked all `monsterpart_bpc_C` objects every 250 ms, including pooled and old-round components.
These calls ran on the game thread. They are a credible source of the reported Gnasher low FPS,
but no native frame-time profile has established how much of Nyxxie's slowdown they caused.

FrameTick now reads the driving compass's native `GetOwningPlayer()` and bounds shared-class
discovery to once per second per Lua state. Only startup/reload before a compass exists uses
a bounded controller fallback. PartMonitor enumerates the chosen actor's
`K2_GetComponentsByClass(/Script/Archon.MonsterPartComponent)` instead of scanning globally.
HP/wound updates remain at 250 ms and tracker/input keep their original cadence. New game-state,
clock reset and ClientRestart invalidate discovery; stale/invalid objects are still checked by
each caller. This does not re-enable UE4SS's startup-unsafe UObject-array cache.

`tests/client-mods/frame-tick.lua`, also run by the existing HUD regression entry point, checks
1,200 simulated input frames, at most ten boss discoveries in ten seconds, live health between
discoveries, and controller/world replacement. The part adapter test rejects any global part
search. These are native-call budget checks, not an FPS benchmark; an in-game comparison is
still required to confirm the performance improvement on the affected PC.

The first local candidate exposed a binding difference: native reflected
`K2_GetComponentsByClass` returns a plain Lua table of RemoteUnrealParam entries, while
array properties use UE4SS TArray userdata with `ForEach`. Treating the return like a property
caused `main.lua:151: attempt to call a nil value (method 'ForEach')` in the live log and
hid the panel. Iterating the outer table alone produced the unavailable-data placeholder:
each entry still needs `value:get()` before object validation. The corrected adapter uses
`pairs` plus entry unwrapping, accepting raw objects as a fallback, and the engine stand-in
now covers both forms. The conversion is confirmed in the pinned
[UE4SS 3.0.1 array/object pushers](https://github.com/UE4SS-RE/RE-UE4SS/blob/v3.0.1/UE4SS/src/LuaType/LuaUObject.cpp):
`GetNonTrivialLocal` arrays iterate elements using `GetParam`, which constructs a RemoteUnrealParam
for UObject entries. Public publication
of that initial candidate was cancelled. Successful layout creation logs one Panel ready
line per rebuild, without per-frame logging, to make native support verification possible.

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
