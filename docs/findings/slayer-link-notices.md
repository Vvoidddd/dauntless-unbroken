# Slayer Link activation and weekly rewards

The 1.4.4 inviter learns acceptance through the invite-list callback at
`0x141607670`. An `Accepted` notice arms
`HandleSlayerLinkSlotActivated`, including the quest event and native prize-pool
generation. Merely listing the accepted link does not deliver that event.

Read-only live inspection found an accepted link alongside an incomplete
`SERIE_slayer_link_00` objective (`CurrentAmount: 0`). The old backend returned
only pending invites and implemented neither shared XP nor prize collection.
The sender now receives accepted/declined/canceled notices during the original
invite window; heartbeat and invite-list replies agree. Latest partner/slot
selection prevents old notices from reactivating replacement links. Native PUT
actions use the same answer handler as POST.

The native game server rolls a pool and PUTs `/slayerlink/links/rewards`.
Pools are immutable per link generation and account, validated against the
packaged 1.4.4 reward table. Connected linked party members share actual Hunt Pass
XP grants; mastery and direct linked-track echoes do not add XP. The cumulative
chest thresholds are 5, 405, 1205 and 2805. The three
`Linked_Slayer_Slot_N` progression tracks read shared state rather than personal
track rows. Confirming a rank grants no items.

Expired links remain visible until their owner collects and releases their own
side. GET rewards does not consume them. The game server's
`SlayerLinks.GrantRewards` inventory transaction must match the served earned
pool; inventory changes and the claim commit atomically. Stored claims prevent
repeat payment even when native retries use a fresh transaction ID or the
ordinary inventory retry ledger expires. Deleting one side never discards the
partner's collection. Missing pools block destructive release and can be stored
later. Slot reuse starts at zero; supplied generation IDs reject stale requests.

Migration 0035 adds separate state, pool and XP tables without altering existing
links, quests or inventories. Historical XP is not fabricated. Previously
accepted links begin sharing XP from this deployment.

The legacy inventory grant does not carry a link ID: matching uses the most
recent served, unclaimed pool with exact item totals. A delayed request with no
generation ID cannot be distinguished from an identical new collection;
generation-aware callers should provide IDs on pool storage and release.
The ordinary progression replay window remains the parent grant's retry policy.

HTTP regressions cover activation notices, shared XP, pool validation, rank
clamping, expired collection, malformed/foreign requests, atomic rollback,
duplicate claims and independent slot release. These verify the backend
contract, not an actual native client's quest completion or reward animation;
those require an in-game check.
