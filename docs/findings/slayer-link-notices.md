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

## Recovering links created before prize-pool storage worked

On 24 October, read-only inspection found 49 older links without either reward
pool, including 27 with earned shared XP. All were created before the first
successful native pool at `2026-10-23T07:59:36.149Z`. GOLLUM's three older links
were among them. Most newer links had native pools; one newer side had also
remained missing for more than five hours. An accepted link
and shared XP do not prove that its prize pool was ever stored; the original
activation notice expires after 24 hours and is not a reliable repair mechanism.

`scripts/repair-slayer-link-pools.cjs` previews missing eligible sides before an
explicit creation cutoff. After a database backup, `--apply` creates only missing
pools in one transaction. Existing pools, claims, XP, slots, partners and end times
remain unchanged. Canceled or released sides and newer links are skipped. A
repeat run adds nothing. This is an administrator recovery tool, not a new HTTP
grant route or automatic reroll. Inventory is still granted only through the
existing expiry/rank/served-reward checks and atomic claim transaction.

The recovery uses the pinned native table and roll policy. All 69 JSON rows match
the serialized asset row order. Each class draws `[5,4,2,1]` candidates using
float32 cumulative weights, stable removal and the original CDF retained after
removal, with a 10,000-attempt limit. The candidate array receives a full-range
swap pass, the four progression ranks are assigned, and another full-range pass
follows. These unusual native operations are intentionally not replaced with
reweighted sampling or Fisher-Yates. Fresh 15-bit crypto draws replace unavailable
historical RNG state; no old pool is overwritten. An incomplete roll aborts repair.

Static evidence: generation `0x141E600`, CDF `0x141F190`, selection `0x141F44A`,
stable removal `0x141F517`, shuffle `0x1409390`, rank assignment `0x141FDDC`.
These are evidence RVAs in the pinned executable, not additional game hooks.

The live recovery filled 98 missing sides across the 49 older links, then the one
additional side confirmed missing in the initial observation snapshot. Existing
pools were audited unchanged, link metadata stayed unchanged inside each write
transaction, and database integrity passed. Authenticated live reads returned 12
prizes for each of GOLLUM's three links. No inventory was granted and no backend
or game world was restarted. Collection still requires the link's seven-day timer
to finish and remains limited to earned ranks. These checks establish the API and
stored reward data, not a visual confirmation from the player's game client.
