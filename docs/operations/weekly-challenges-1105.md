# 1.10.5 daily and weekly challenges

The 1.10.5 metagame serves one verified daily challenge row:

`Challenge_Daily_Hunt`

and one verified weekly challenge row:

`Challenge_Season_DamageTotal`

Both tuning responses advertise one slot, one automatic draft, and a 100-unit season-17 coin reward. Daily and weekly challenges are stored in separate draft and bounty state from ordinary bounties. Claimed rows can be removed by the native claim flow; the backend does not remove a player's saved progress during reads or restarts.

`Challenge_Season_Break_Armour_Rock` remains disabled. Existing saved rows for that challenge are retained for recovery but are not restored to the active board because this row has a reported 1.10.5 crash. Re-enabling it needs a native reproduction and review.

The backend change was tested with disposable accounts and an isolated database. The compatibility test checks both tuning payloads, safe-row exclusion, separate daily and weekly draft persistence, objective progress updates, stale-version handling, and game-server season-coin grant replay. The full metagame suite passed locally with 949 tests.

This does not certify hosted-realm behavior or a complete native hunt or claim. The daily row is enabled from the recovered native ID and isolated reward metadata; in-game reset and claim behavior still need native verification. The responses do not invent retail challenge rows that are not present in the recovered 1.10.5 evidence.
