---
title: Fleet admission and database storage
description: Two EU game hosts, UK key distribution and verified database copies.
---

# Fleet admission and database storage

The current realm uses two EU game hosts and a separate UK service host:

| Host | Role |
| --- | --- |
| `5.83.134.32` | EU #1: game worker for hunts, Ramsgate and Training Grounds |
| `5.175.140.184` | EU #2: shared 1.10.5 backend, gateway, allocator, dashboard and game worker |
| `82.153.118.185` | UK: key bot and verified database backup storage |

The game runtimes are `C:\Unbroken1105` on EU #1 and `E:\Unbroken1105` on EU #2.
The authoritative database is `E:\Unbroken1105\backend-state\realm.db` on EU #2; UK services use `C:\DauntlessUnbrokenBot`.
These installed runtime roots are not Git checkouts. Build source separately and
stage the resulting application files; preserve `data`, keys, TLS and environment files.

## Admission and queue positions

Launcher 1.0.6 requests authenticated Ramsgate admission before starting the game.
When capacity is unavailable it displays **Servers are full** and the player's
position out of the total players waiting. Admission continues automatically when
space becomes available. Leaving the queue cancels that launch attempt.

The launcher and retail client reuse one matchmaking candidate and one reserved
city seat. A full primary city pool tries the second EU host before refusing
capacity. The existing hunt allocator still enforces CPU, memory, port and hunt
limits; queueing does not disable those protections.
Reconnecting a party leader admits that player individually and leaves other
members on their existing hunt.

Capacity attempts are ordered by original queue age within their eligible region
and resource type. A later poll cannot take an older active candidate's turn.
Parties allocate together; a four-player party uses one hunt process. A full city
queue does not block independent hunt capacity. Displayed positions count players,
with members of a party or matchmaking batch sharing their group's starting place.

Active polls renew waiting leases, allowing long waits without a fixed queue timeout.
Disconnected waits expire instead of blocking the next player. The launcher's hunt
status poll only observes the game-owned queue; it cannot renew an abandoned hunt.
Newer launchers fall back normally when an older private backend returns 404 for
the admission endpoint. Waiting queues are in memory and reset on backend restart.

`POST`, `GET` and `DELETE /unbroken/api/Admission` authenticate the caller using
their own account key. The server chooses account identity and priority; request
bodies cannot specify another player or a preferred position. Responses contain
aggregate counts, not other players' identities. The gateway allows only these
three admission methods; backend requests are rate limited per account.

## Database copies and cleanup

Player changes are saved during play; the weekly job is a recovery backup, not the save interval.
EU #2 runs **Unbroken 1.10.5 verified backup** every Sunday at 03:00 host time.
It asks the running backend to create an online SQLite snapshot through its authenticated,
loopback-only backup endpoint. Using the database writer avoids a separate backup connection
holding a read lock and delaying player saves in DELETE journal mode.

The UK task **Dauntless Unbroken database copies** runs Sundays at 03:00 UTC.
It pulls the completed EU #2 snapshot, verifies SHA-256 and SQLite `quick_check`,
then renames the temporary `.db.partial` file to its final `.db` name.
The source SSH key is restricted to `Export-DatabaseSnapshot.ps1`: it can read
managed snapshots, but cannot run a shell, upload files or use SFTP. Host keys are pinned.
OpenSSH 9.x needs legacy SCP (`-O`) for this restricted source.

Each managed backup location keeps its newest verified snapshot. The previous snapshot
is deleted only after the replacement passes verification. A failed backup or copy
keeps the previous good snapshot. Cleanup is restricted to managed backup paths and
skips reparse points; it never deletes the live database, account keys or configuration.
A shared lock prevents cleanup from racing an active copy.

The UK copy contains the database. Back up server secrets and configuration separately;
they are not included in the downloadable snapshot.

## Verification

- `deploy/windows-server/Test-DatabaseBackupRetention.ps1`: verified replacement and retention.
- `deploy/windows-server/lib/dr-db-backup.test.cjs`: writer endpoint failures and concurrent WAL writes.
- `DauntlessUnbrokenMetagame/test/launcher-admission.test.ts`: account isolation, queue age, cancellation and seat reuse.
