# November 3 fixes

Merged into `1.10.5`: #28 (chat and friend presence), #30 (party return after a backend restart), #32 (preserve extra files during game removal), #34 (wait for Linux package installation), and #38 (Training Grounds hammer replication).

Daily and weekly challenges are still on hold. #37 is not merged, and #36 remains unfinished.

Two follow-up corrections are included: the chat address repair also handles a valid current domain without a saved domain, and hammer replication scans each connection's actor list once instead of once per equipped hammer. The native offsets were checked against the pinned 1.10.5 build; they must be checked again before using another game build.

Checks passed on the combined changes: 932 backend tests, 428 launcher tests (3 skipped), the native DLL build, the presence address test, and the executable hash/entry-point check. These checks do not replace hosted multiplayer testing. Chat, party return after restart, and hammer variants still need that confirmation.

Launcher 1.0.54 packages the client changes. Existing game processes need a full restart to load a new DLL. A server DLL replacement applies to newly started worlds; already running worlds keep their loaded code.

The remaining combat reports are still open, including Thrax recovery, intermittent projectile damage, Omnicells, weapon meters, Radiant Escalation effects and the corruption/zero-health case. A player at zero health can be correctly downed, so zero health alone is not a safe trigger for an automatic reset.
