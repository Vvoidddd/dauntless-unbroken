# Bounty restoration

The 1.4.4 import copied bounty rows without checking whether 1.10.5 still has their definitions. On November 3, the live database had 13 rows across seven ordinary bounty IDs absent from the 1.10.5 catalogue. The board now filters unsupported ordinary IDs on every read and write response, including draft choices and history. Old rows stay in the database; new board updates cannot replace or delete them. Valid bounties keep their progress and rewards.

The supported list comes from the 186 rows in `Archon/Content/Gameplay/Bounty/bounty_table` in build 365075, `Archon_24-WindowsClient.pak`. Source hashes:

- uasset: `13057f93fe908e535523ba5161c173d55190b52fbbaeec24d832581ddda56137`
- uexp: `935e5fec07fd55f061078c62f833825e106d862eb83378a845126c05d9132da7`

`Challenge_Season_Break_Armour_Rock` is different: it exists in 1.10.5's weekly challenge table. Players reported it causing crashes; 149 accounts held its `-season17-7` instance. We temporarily hide that challenge from restored boards and explicitly disable its weekly tuning entry. Its saved progress remains intact. This is crash containment, not a confirmed diagnosis of the native crash. A native reproduction is needed before re-enabling it.

The checks cover GET, partial saves, deletes, draft filtering, slot collisions and preserved database rows. Legacy 1.4.4 mode is unchanged. Update the supported list when changing game builds; do not reuse it for a different native catalogue.
