# Hunt entry recovery — November 2

Three separate problems were found during the public 1.10.5 rollout:

- EU1's scheduled supervisor could not attach already-started children to the shared CPU job (Windows error 87). It now starts outside Task Scheduler's job and joins the 60% CPU job before spawning children. Child launch scripts verify inherited membership. The live SYSTEM task was checked with eight processes in the shared job and task result 0.
- Repeated matchmaking polls renewed `requestedAt`, so a failed hunt startup could keep its port reservation indefinitely. `launchedAt` now records the original startup time. Cleanup requires both a dead process and a successful UDP snapshot showing no listener; unknown socket state keeps the reservation.
- Hunting Grounds parties sent `SHARED`, while the allocator expected the island route and an explicit player roster. Normalize 1.10.5 island requests before selecting the party path and include the roster for 1.10.5 parties. Regression checks cover island parties and Training Grounds parties. Void and WinteryKnight24 confirmed that the immediate cancellation stopped and the hunt loaded.

Validation: TypeScript compilation, 53 matchmaking recovery tests, allocator checks, and live deployment checks passed. The CPU cap remains 60% on EU1.

## Loading timeouts still under investigation

Successful allocation is not proof that the client finished loading. WinteryKnight24 and Zircon subsequently reported loading timeouts. In the observed party attempt, the native server reached four connections and continued advancing replication frames; Wintery's backend character and inventory requests succeeded. This does not establish why the client timed out.

Wintery's uploaded launcher 1.0.45 report showed all 606 game files verified. Its launcher log did not include a game-side loading failure. The earlier completed relay session recorded zero relay failures, but that does not verify UDP traffic or diagnose the later attempt. Keep this issue open until game logs or a reproduced connection trace identify the failing stage.

Do not treat a longer timeout, a populated dashboard, or an allocated port as a verified fix for this remaining issue.
