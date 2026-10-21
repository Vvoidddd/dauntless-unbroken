# Party recovery

The metagame checkpoints multi-player party membership beside `DB_FILENAME` in a `.parties.json` file every five seconds. It writes a temporary file and renames it atomically. A checkpoint older than two minutes, larger than 4 MiB, malformed, or from the future is ignored. Restored members get two minutes to resume activity.

Only party IDs, member IDs, leader, creation time and last activity are saved. Allocation promises and travel tickets are never replayed. This protects parties across brief backend restarts; pending hunt searches can still need another attempt. Explicit leaving, kicking, blocking and inactivity rules continue to apply.
Quiet HTTP/chat does not remove individual members. Offline members stay until Leave or Kick, so a long hunt or missing presence update cannot split the party. A leadership recovery request can transfer control to an active member without evicting the former leader. Entirely inactive groups expire after two hours; solo parties retain their thirty-minute idle cleanup. Queue leases and hunt occupancy remain separate, so retaining a party does not reserve a hunt server.

Bound authenticated chat frames renew party activity, including keepalive replies during hunts. They do not fabricate a player's map, playtime or presence. Friends still see a real disconnection as offline until their client reconnects.
After a successful chat bind, a five-second fallback announces that connected session if the client never rebroadcasts presence. A later client status replaces it; explicit unavailable is respected, and the server still never sends a player's own presence back to that account.
Complete authenticated native connection snapshots also renew party activity for connected player IDs, including after backend recovery. Expected-player lists alone never count as activity, and neither signal renews a matchmaking queue lease. Count-only `nativeActivity` diagnostics in the private checkpoint show whether this feed is reaching the backend.

Native hunt connections remain the authority for empty-instance cleanup. Unknown native telemetry is labelled unavailable in launcher instance cards, and does not prove a hunt empty. A hunt's displayed running time is its total age, not the duration with zero players.
