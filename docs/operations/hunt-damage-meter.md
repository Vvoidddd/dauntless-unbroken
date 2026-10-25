# Hunt Damage preview

Launcher `1.0.35-damage.1` bundles an optional Windows UE4SS damage panel. It is a
prerelease, so the stable update feed remains on the stable launcher. Native
in-game viewport rendering and two real players still need a smoke test; the
Windows computer-use helper was unavailable during this change. This preview
does not enable UE4SS under Proton/Wine or modify either native DLL.

The left panel shows the local Slayer's core, part, stagger and wound totals,
core DPS since the first observed hit, teammate core damage/share, and the team's
core total. Core alone determines DPS and contribution: the other channels
overlap and must not be added to it. Totals cover this client visit, survive
individual Behemoth deaths/round changes in the same session, and reset on a new
session. Hiding the panel keeps counting. Home → Hunt Damage exposes visibility
and team-breakdown settings. Normal four-player hunts show every participant;
larger training groups show the top four and an all-observed-player total.

The only counting hook is
`/Script/Archon.ArchonCombatTextComponent:MulticastSendMultitypeCombatText`.
It reads parameters and returns nothing. The component owner must be a Behemoth
in the local game-state instance, and the source pawn's PlayerState must be in
that instance's roster. UI identity includes the game-state object address and
session, so revisiting a same-named map cannot reuse a stale panel. Widget opacity
tag `0.995` is distinct from the existing tracker, menu and lock-on tags.

The pinned 1.4.4 executable was traced: RPC exec RVA `0xEF6ED0` calls component
vtable `0x469D5E8` slot `+0x3E8`, implementation `0x13A5750`. On clients this copies
every received `0x30`-byte entry to the pending array before the later display
filter at `0x13B0540`. The training DPS widget instead filters to the autonomous
local Slayer at `0x17661F0`. Entry fields are SourceActor, CoreDamage, PartDamage,
StaggerDamage and ExposeDamage (wound), matching the checked-in SDK.

These are **observed totals**, not an authoritative scoreboard. The multicast is
unreliable and limited by network relevancy; late joins, distant hits or packet
loss can omit damage. There are no event IDs. Only one hook counts each delivered
entry; amount/time deduplication would incorrectly discard legitimate repeated
hits. PlayerMatchReport contains loot/progression, not a team damage ledger.

Checks: `lua5.4 tests/client-mods/damage-meter.lua` exercises channel separation,
legitimate identical hits, invalid values, clock resets, session resets,
roster/world isolation, tracker cleanup isolation, one-time hook installation,
live visibility toggles and HUD bounds/input transparency. CI runs this check.
The existing launcher mod installer preserves local switches and verifies the
regenerated bundle manifest. Mock engine checks do not establish actual UE4SS
parameter marshalling or the final appearance inside a running hunt.

Hook/array behavior is documented by the primary
[UE4SS RegisterHook documentation](https://docs.ue4ss.com/lua-api/global-functions/registerhook.html)
and [TArray documentation](https://docs.ue4ss.com/dev/lua-api/classes/tarray.html).
