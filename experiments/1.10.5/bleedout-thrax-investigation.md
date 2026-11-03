# Corruption, zero health and Thrax

These reports are still open. I have not reproduced the corruption exploit or the stuck Thrax animation.

## Zero health

The native knockdown RPC is present in build 365075. `ServerTryStartBleedout` enters at RVA `0x2075210`, validates through vtable offset `0x430`, and calls the implementation at offset `0x438`. The constructor installs vtable `0x51A0640`; that implementation is `0x1B81660`, not a stripped return stub.

The implementation checks the bleedout state and registered replacement effects. The ordinary path applies the no-health gameplay effect. A replacement can intentionally remove it and run `ReplaceBleedout` / `AuthOnBleedoutReplaced`. `AuthSetBleedoutState` at `0x1B5C230` requires authority and only dispatches the transition once `bIsReadyForBleedoutEvents` is set. Adding a blanket forced-death rule here would bypass those mechanics.

On November 3, a read-only sample of both EU hosts found 26 connected characters. One had authoritative HP `0`, bleedout state `1`, readiness `1`, no-health effect handle `22632`, and no replacements. The other 25 had positive health. That zero-health sample was correctly marked as downed; it does not reproduce attacking while at zero. The later snapshot of that same world found positive health and state `0` again.

Run the bounded snapshot on a host during a reproduction, using its actual game-process IDs:

```powershell
.\Read-Bleedout.ps1 -WorldProcessIds 1234,5678
```

The script opens processes for reading only and rejects an executable whose SHA-256 differs from build 365075. It reads current server HP, bleedout state (`0` none, `1` downed), readiness, no-health effect handle, and replacement count. Slots are connection indexes, not stable player identities. A snapshot can race travel or destruction; skipped objects are not proof of a gameplay fault. It does not capture damage or RPC execution. Compare it with the affected player's HUD and actions before deciding whether health, replacement logic, or replication is wrong.

The committed reader compiled and ran on both hosts, returning health/state for 26 characters across 17 world processes without read errors. No world restart or gameplay mutation was needed.

## Thrax

The cooked component is `/Game/Blueprints/Weapons/_shared/legendary/randall/legendary_randall_part_bpc` in `Archon_0-WindowsClient.pak`. Its name/import table contains `ActiveInvulnerableHandle`, `DefaultGravityScale`, `CurrentAbilityState`, `PreviousAbilityState`, `OnEnd_AimingState`, `OnEnd_DivingState`, `OnEnd_Attacking`, `OnAttackMontageBlendingOut`, `Server_SetCurrentAbilityState`, and `Server_EndTask`.

That identifies the state machine to inspect, not a broken callback. During a failed use, compare its state, invulnerability handle and gravity on the server and owning client, and record which end-state callback runs. Generic ability activation already acknowledges success; sending another success acknowledgement is not a Thrax fix.

All offsets and conclusions above are specific to the verified 1.10.5 executable. Recheck them after a binary change. See [bounty restore compatibility](bounty-restore-compatibility.md) for the separate bounty containment already deployed.
