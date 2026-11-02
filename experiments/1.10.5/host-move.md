# EU2 test host

The test realm moved to EU2 on November 1. Live 1.4.4 now runs on EU1 only;
I waited for EU2's last live hunt to finish before stopping its old stack.
The EU1 shared 60% CPU limit stays in place.

- EU2: `5.175.140.184`, runtime at `E:/Unbroken1105`.
- UK: `82.153.118.185:62002` forwards TCP to EU2 port 62002. Existing test
  invites, pinned certificate and account keys remain valid. The UK test task
  is disabled; the key bot and backups still run there.
- Game traffic goes directly to EU2 UDP 63870–63875. Ramsgate and Training
  Grounds use 63870/63871, with four on-demand hunt slots above them.
- Backend 62000, allocator 62001, chat 62099 and owner dashboard 62110 bind
  to loopback. The dashboard is accessed through SSH, not a public admin port.
- `Unbroken1105-TestRealm` starts the realm at boot under SYSTEM. The old
  EU2 live stack, allowlist and fleet-watchdog tasks are disabled.

The DLL still has absolute paths under `C:/dr/build-1.10.5-20261030`, so that
directory on EU2 is a junction to `E:/Unbroken1105`. Keep it until those paths
are removed from the native code. The runtime carries Node 24.19.0, matching
the SQLite module copied from the old host.

The source and destination database checksums matched after stopping the UK
writer. SQLite integrity passed. The gateway authenticated through the original
UK address, and EU2 successfully fetched ZeTo's live save and imported it into
an in-memory database. ZeTo's current live key hash already matches his test
account. RepeatersGoBrrrr completed a real first-login import after the move.
These checks prove transfer/authentication; they do not certify every hunt or
the outstanding NPC, bounty, movement and combat issues.

EU1's running allocator still remembers its old overflow destination. Its
persistent configuration has overflow disabled. Until the next planned EU1
restart, `Unbroken1105-RetiredWorker` on EU2 loopback 61001 returns a complete
empty world list and a draining capacity response, so requests return to the
existing queue rather than hanging on a dead worker. Do not remove this stub
before EU1 has restarted with the updated configuration.

The Windows TCP forwarder hides individual client IPs. The gateway's 30 logins
per minute limit is consequently shared by forwarded testers (two concurrent
imports maximum). Keep that limit for this small test; move launchers to a new
direct endpoint and certificate before expanding the group substantially.

The stopped UK save is retained for rollback. It becomes stale as soon as EU2
accepts players: never restart it as a second writer, and copy the current EU2
state back first if rolling back. Transfer archives can be removed after the
hash/integrity checks; they are not the runtime or the retained source save.
