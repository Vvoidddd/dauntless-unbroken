# 1.10.5 party Escalation amp disconnect investigation

## Result

This investigation did not reproduce a party disconnect during an Escalation amp
selection. No code fix is justified by the available evidence.

The existing amp replay guard is a separate 1.4.4 server change. It is included
by `DauntlessUnbrokenInternalServer/dllmain.cpp`, uses the 1.4.4 SDK and pinned
1.4.4 RVAs, and is not loaded by the 1.10.5 bootstrap. The 1.10.5 bootstrap is
an independent build-365075 DLL and currently has no hook for
`ClientDisplayRelicChoiceUI` or `ServerSelectRelicOption`.

PR #69 addresses a different, observed 1.10.5 APEX destructible-report crash.
Its own description leaves the amp disconnect unconfirmed. It should not be
treated as an amp-selection fix.

## Checks

- The metagame test suite passed: 941 tests, 0 failures.
- The existing 1.4.4 amp policy test could not run because `cl.exe` is not
  available in this environment.
- The 1.10.5 native executable was not present at the path used by the build
  checks, so the build-365075 amp/RPC layout could not be inspected here.
- The recorded 1.10.5 client and server logs contained no amp, relic,
  disconnect, travel-failure or exception lines.
- No live server was changed or restarted, and no user screen was accessed.

## Next evidence needed

A reproducible 1.10.5 party run should capture the client and game-server logs
from the same round, including the amp offer, selection RPC, disconnect reason,
and the server's last accepted connection state. The 1.10.5 executable and its
matching SDK or a symbol-independent RPC trace are required before porting the
1.4.4 guard or changing shared native code.
