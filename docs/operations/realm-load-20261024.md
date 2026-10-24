# Fleet load and Koshai crafting checks

The EU worker was deliberately drained during the hunt-entry connection investigation.
Its low CPU did not mean it was accepting hunts. Allocator status now includes a fresh
`draining` boolean, carried through dashboard and Discord projections. A drained host is
shown as “Draining · new hunts paused”; older telemetry without that field remains unknown.
CPU and memory admission checks still apply. The configured hunt limit is a ceiling,
not a guarantee that the machine can run that many simultaneous worlds.

Public UDP probes on both previously affected worker ports subsequently passed from the
same observer, with local and primary-host controls. Two real overflow hunts then admitted
four connected players through a monitored canary. Normal overflow routing resumed after
that check. No occupied worlds were restarted, and no simulation, replication or CPU
threshold settings changed. Connectivity can still fail independently for another path;
one public probe alone is insufficient to declare all players fixed.

## Koshai recipes

Koshai hunting and crafting have separate cooked quest requirements. The primary gear
gate is `CR19_S4_Q1F_WilsRiftstalker` (**Bring On the Night**, redeemed), with the legacy
`KillQuest_KoshaiNormal` alternative. Being able to select Koshai's hunt does not satisfy
that gear requirement by itself. A player still on **Craft an umbral weapon with Wils
Bormen** must complete and redeem that quest before its primary gear gate is met.

Koshai's Bloom has a separate **Green Light** gate and requires a Koshai tail material.
The initial armour and weapon recipes also have their own material counts. Compare exact
catalogue IDs and quantities, not similarly named material aliases. No progression reset
or grant-all operation is appropriate when the saved quest and ingredient requirements
already explain the locked recipe.

The recipe requirements were checked against the owned pinned 1.4.4 cooked catalogues;
no game assets or player save data are included here. The relevant interoperability
structures are `FCraftingRecipe` and the inventory recipe/quest query methods in the SDK.
