# 1.10.5 weekly challenges

The 1.10.5 metagame serves one verified weekly challenge row:

`Challenge_Season_DamageTotal`

The weekly tuning response advertises one slot, one automatic draft, and a 100-unit season-17 coin reward. The challenge is stored in the weekly draft and bounty state, separate from ordinary bounties and daily challenges. Claimed weekly rows can be removed by the native claim flow; the backend does not remove a player's saved progress during reads or restarts.

`Challenge_Season_Break_Armour_Rock` remains disabled. Existing saved rows for that challenge are retained for recovery but are not restored to the active board because this row has a reported 1.10.5 crash. Re-enabling it needs a native reproduction and review.

The backend change was tested with disposable accounts and an isolated database. The compatibility test checks the weekly tuning payload, safe-row exclusion, separate weekly draft persistence, objective progress updates, stale-version handling, and game-server season-coin grant replay. The full metagame suite passed locally with 927 tests.

This does not certify hosted-realm behavior or a complete native hunt. Daily challenge tuning remains disabled until its assignment and reward path has its own verified fix. The weekly response also does not invent retail challenge rows that are not present in the recovered 1.10.5 evidence.
