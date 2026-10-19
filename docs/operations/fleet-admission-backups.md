---
title: Fleet admission and database storage
description: Two EU game hosts, UK key distribution and verified database copies.
---

# Fleet admission and database storage

The current realm uses two EU game hosts and a separate UK service host:

| Host | Role |
| --- | --- |
| `5.83.134.32` | EU #1: shared metagame, gateway, primary allocator and private dashboard |
| `5.175.140.184` | EU #2: game worker for hunts, Ramsgate and Training Grounds |
| `82.153.118.185` | UK: key bot and database snapshot storage; no game hosting |

The primary runtime is `C:\DauntlessUnbroken`; the second game runtime is
`E:\DauntlessUnbroken`; UK services use `C:\DauntlessUnbrokenBot`.
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

The primary continues producing verified online SQLite snapshots. The UK task
**Dauntless Unbroken database copies** pulls a completed snapshot hourly and at boot.
It refuses snapshots older than two hours, checks SHA-256 and SQLite `quick_check`,
then renames the temporary `.db.partial` file to its final `.db` name. No live
database files are copied while being written.

The source uses a separate SSH key restricted to `Export-DatabaseSnapshot.ps1`:
only snapshot metadata and reads under the managed backup directory are allowed.
It cannot run arbitrary shell commands, upload files or use SFTP. Host keys are pinned.
Windows inbox OpenSSH 8.x uses legacy SCP by default; OpenSSH 9.x requires `-O`
for this restricted source. The receiver chooses according to the installed binary.

**Dauntless Unbroken backup cleanup** runs hourly and at boot. Cleanup also runs
after each transfer, including failures. It removes receiver-owned `.partial` and
`.failed` files and snapshots whose **CreationTimeUtc is older than three days**.
Modification times and filename dates do not determine age. A shared OS-held lock
protects an active copy; locked files and reparse points are skipped. Other database
filenames, the live database, configuration and keys are outside this deletion policy.

The private dashboard receives EU #2 and UK telemetry over restricted SSH tunnels.
Monitoring binds to loopback only. UK reports snapshot verification time and no hunt
hosting; stale or missing capacity remains unknown rather than being displayed as zero.

## Verification

- `DauntlessUnbrokenMetagame/test/launcher-admission.test.ts`: account isolation,
  original queue age, twenty-minute waits, cancellation and single-seat reuse.
- Launcher controller tests: no spawn while queued, position display state,
  cancellation, admission and hunt queue observation.
- Deploy city tests: whole-party reservations and second-host fallback.
- `deploy/windows-server/Test-DatabaseBackupRetention.ps1`: creation-time retention,
  partial cleanup, transfer locking and protection for unmanaged databases.
