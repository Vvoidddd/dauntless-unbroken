# Server CPU optimization candidate

Status: local candidate. This document describes work that has not been released
or deployed to live game servers.

## Scope

The candidate reduces avoidable allocation, hash-table rehashing and repeated
Unreal class/world lookups in the native dedicated-server DLL. It does not lower
the configured server frame limit, change replication cadence rules, or change
the live fleet.

The implementation is kept in [a separate pull request](https://github.com/FxckingAngel/dauntless-unbroken/pull/3).
That pull request must be reviewed and merged before this documentation is
treated as a description of released behavior.

## Local evidence

Testing used the isolated Windows 1.10.5 lab on the same machine and the same
Ramsgate world. With `DR_SERVER_MAX_FPS=30`, a 15-second idle sample measured:

| Build | Process CPU time |
| --- | ---: |
| `HEAD` baseline | 26.05 s |
| local candidate | 23.42 s |

That is approximately 10% less process CPU time in this idle sample. It is not a
live-fleet measurement and it does not establish the result for a connected hunt
or a particular player count.

The candidate was also checked by:

- Release x64 compilation with Visual Studio 2022 Build Tools.
- Channel lookup, connected-player snapshot, fall-recovery policy, owner-only
  replication, replication cadence, hunt-idle policy and server-frame-limit tests.
- An isolated 1.10.5 Ramsgate boot reaching `listen=1` on the local test port.

The isolated DLL was removed after the boot check. No live host was changed.

## Release and deployment boundary

The locally built DLL is not a release artifact. Do not copy it into a live game
directory, launcher asset directory or server package. A release requires the
implementation PR, its CI checks, a version-matched DLL, and the normal server
deployment review.

Before claiming a production CPU improvement, repeat the measurement with a
connected local client at representative player counts and compare
`DR_EngineMicros`, `DR_ReplicationMicros`, `DR_ServerTickCount` and
`DR_ServerSimulatedSeconds` over the same wall-clock interval. The current local
client harness does not complete that connected-session flow without its launcher
relay, so no connected-player CPU claim is made here.
