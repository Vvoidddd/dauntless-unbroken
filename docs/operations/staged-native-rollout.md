# Staged native server rollout

The pool-level admission switch used below is implemented in [PR #48](https://github.com/Vvoidddd/dauntless-unbroken/pull/48), merged into `1.10.5`. This guide applies to a deployment built from that branch or a later one. The merge and its passing checks do not mean that any live host has been updated; complete the rollout and in-game verification separately.

Use separate deploy-server pools when replacing a native DLL. A DLL already loaded by a game process does not change when the file on disk is replaced.

1. Start a new pool from a separate game root with the candidate DLL. Verify its executable and DLL hashes before admitting players.
2. Leave the existing pool running and set `HUNT_ACCEPTING_NEW=0` in that pool's deploy environment. This stops new hunt reservations, but existing hunts continue normally.
3. Route new hunts to the new pool. Do not use the host-wide `DRAIN_FILE` when the old and new pools share a host; that flag drains the whole deploy server.
4. Watch the old pool's running-hunt count until it reaches zero. Keep the old pool available for rollback during this period.
5. Stop the old pool only after its count is zero. Keep the new pool's DLL and process start times recorded with the rollout.

`HUNT_ACCEPTING_NEW=1` or an unset value admits new hunts. The setting is checked for each admission request, so changing the pool environment requires the normal deploy-server restart; a drain file remains the restart-free emergency toggle for one deploy server.

This procedure does not prove the native fix by itself. Test an equipped Omnicell in a new hunt before retiring the old pool, and record the candidate DLL hash with the result.
