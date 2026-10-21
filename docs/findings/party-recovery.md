# Party recovery

The metagame checkpoints multi-player party membership beside `DB_FILENAME` in a `.parties.json` file every five seconds. It writes a temporary file and renames it atomically. A checkpoint older than two minutes, larger than 4 MiB, malformed, or from the future is ignored. Restored members get two minutes to resume activity.

Only party IDs, member IDs, leader, creation time and last activity are saved. Allocation promises and travel tickets are never replayed. This protects parties across brief backend restarts; pending hunt searches can still need another attempt. Explicit leaving, kicking, blocking and inactivity rules continue to apply.

Bound authenticated chat frames renew party activity, including keepalive replies during hunts. They do not fabricate a player's map, playtime or presence. Friends still see a real disconnection as offline until their client reconnects.

Native hunt connections remain the authority for empty-instance cleanup. Unknown native telemetry is labelled unavailable in launcher instance cards, and does not prove a hunt empty. A hunt's displayed running time is its total age, not the duration with zero players.
