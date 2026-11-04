# 1.10.5 party Escalation amp disconnect investigation

## Result

This investigation did not reproduce a party disconnect during an Escalation amp
selection. The missing 1.10.5 server-side selection protection was still a
concrete compatibility gap, so it is fixed separately in PR #84.

The existing amp replay guard remains a separate native-server change. It is
included by `DauntlessUnbrokenInternalServer/dllmain.cpp`, whose guard comments
and SDK are pinned to the older 1.4.4 server. PR #84 adds an independently built
guard to the 1.10.5 build-365075 bootstrap, with its own SDK size and offset
assertions and an exact `ProcessEvent` byte check.

The extracted 1.10.5 SDK does contain those two RPCs and keeps the relevant
`RelicOptionsForCurrentRound` and `RoundEndRewardsReceived` fields at the same
offsets, but its `UPlayerEscalationComponent` is `0x2E0` bytes rather than the
repository native-server SDK's `0x2D0` bytes and has additional 1.10.5 members.
The 1.10.5 guard compares the displayed offer with the replicated
`RelicOptionsForCurrentRound` entries before publishing a one-use selection
permit. It rejects stale, forged, changed-quality, changed-advance-flag and
replayed selections before the native RPC callback.

PR #69 addresses a different, observed 1.10.5 APEX destructible-report crash.
Its own description leaves the amp disconnect unconfirmed. It should not be
treated as an amp-selection fix.

## Checks

- The metagame test suite passed: 941 tests, 0 failures.
- The shared amp policy test passed under the installed MSVC toolchain.
- The isolated 1.10.5 bootstrap rebuild passed and produced
  `experiments/1.10.5/bin/DauntlessUnbroken.dll`.
- The isolated build contained the executable and extracted SDK. The pinned
  NoEAC, hook-entry and presence checks passed; the PE inspection was unavailable
  because the Python `pefile` module is not installed.
- The pre-fix recorded 1.10.5 native logs contain `apex_report_guard_enabled`
  but no amp-selection guard marker. They contain no amp, relic, travel-failure
  or game-network exception lines. Chat disconnect lines exist, but do not
  identify a game-server disconnect or an amp selection.
- No live server was changed or restarted, and no user screen was accessed.

## Next evidence needed

A reproducible 1.10.5 party run should capture the client and game-server logs
from the same round, including the amp offer, selection RPC, disconnect reason,
and the server's last accepted connection state. The guard is a defensive fix;
it does not prove that the original unobserved disconnect was caused by replayed
or forged selection traffic.
