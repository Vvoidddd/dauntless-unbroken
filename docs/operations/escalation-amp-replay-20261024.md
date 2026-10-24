# Escalation amp replay guard

The pinned 1.4.4 server accepts `ServerSelectRelicOption(FName, bool)` repeatedly
against the same unchanged `RelicOptionsForCurrentRound`. Its native validator
returns true. Each accepted replay applies the buff, appends a relic choice and,
when the supplied flag is true, increments `RoundEndRewardsReceived`.
`GetRoundForCrystalReward` reads that counter directly. Replays can therefore
inflate both combat buffs and reward indexing. Missing rewards from a particular
reported run have not been quantified; accepted persistent XP saves were observed.

The server ProcessEvent guard arms one selection when the server publishes
`ClientDisplayRelicChoiceUI`. It checks the offered IDs/qualities against current
server options, requires the trusted advancement flag, and consumes permission
before forwarding the native handler. Replays cannot reapply the buff or increment
the counter. A genuine later publication rearms permission, even for identical
cards or a non-advancing bonus offer. It does not impose a damage cap or ban users.
An already inflated active run is not rewritten.

The reported AutoHotkey macro binds F1 to `SendInput, {Space 100}`. The regression
test sends 100 selection retries after a valid choice and checks one application
and one counter advancement for that offer. It also covers invalid IDs/flags,
changed quality, a later identical offer and callback republishing.

## Native evidence and version boundary

RVAs below are relative to the owned pinned 1.4.4 executable, not new hooks:

- Handler `0x144A480`: iterates component options, applies at `0x144A518`, increments
  component `+0x150` at `0x144A522`, and leaves the offered array intact.
- Validator `0x789190` returns true. Reward getter `0xC18840` reads `+0x150`.
- Publication helper `0x14198D0` assigns current options at `0x14198F9`, then builds
  the same ordered ID/quality pairs and calls the reflected UI wrapper at
  `0x1419995`. Normal and specific-offer callbacks use the same helper. Additional
  relic choices widen its candidate array, rather than granting additional picks.
- Weak getter `0x1F79240` verifies object-item serial at `+0x10`, stride `0x18`.
  Controller initialization at `0x162CBF7` assigns the component weak reference,
  allocating its serial. The SDK's weak getter omits this serial check; the guard
  reads the verified serial and does not reuse a consumed offer across lifetimes.

Revalidate these contracts when changing the game executable or SDK. The RPC has
no offer nonce; the guard uses the trusted server publication boundary and current
options, rather than claiming to identify arbitrary cross-offer client replays.

## Server artifact and rollout

Server artifact: `deploy/windows-server/assets/DauntlessUnbroken.dll`, SHA-256
`06b4c3640f95c8371b960286a890091984490ba3a4bf5a464c5e33c88e976aa0`.
The server installer pins this artifact separately from the stable launcher and
friend-kit client DLL. This change does not require a launcher release.

Disk replacement applies to newly created server worlds. Existing worlds keep
their mapped DLL and retire normally; do not restart occupied worlds to force
this patch. Keep the previous DLL and matching pin for rollback, and compare the
actual module mapped in a newly created world with the expected candidate path
and hash. A readiness smoke test is not an in-game amp/XP playthrough.

The Release x64 build and replay policy check passed. An isolated worker process
and a primary-host process reached readiness with the candidate loaded. After
disk rollout, a naturally allocated worker world was observed with the candidate's
mapped image timestamp `1792878087` and image size `335872`; all pre-rollout world
PIDs remained alive at replacement. No live services were restarted. A complete
in-game amp-selection and per-round XP playthrough is still outstanding.

Repository hygiene/pin checks passed. The broader local deployment-kit run ended
with 207 checks passing and two chat-listener status checks failing. A focused
listener probe reproduced the same status failure with the pre-patch helper from
`30bde52`; its chat functions are unchanged. Do not describe the entire kit suite
as passing or treat this as an Escalation regression.
