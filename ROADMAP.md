# Dauntless Unbroken roadmap

Current source and releases are maintained on `main` in [Vvoidddd/dauntless-unbroken](https://github.com/Vvoidddd/dauntless-unbroken).

`docs/roadmap.md` is a copy of this file. Update this checklist and run `node tools/sync-roadmap.js`.

## Implemented

- [x] Unbroken project names, native DLL integration, purple launcher and a separate release/update feed.
- [x] Existing-game discovery with folder confirmation before verification or modification.
- [x] Automatic Desktop account-key recovery files, encrypted local key storage and isolated offline saves.
- [x] R2 game downloads with resume support and pinned file verification.
- [x] Persistent accounts, characters, inventory, progression, loadouts and social services.
- [x] Rams shop purchases, weekly rotation synchronized with the Middleman clock and a once-per-account Void creator reward.
- [x] Granny Strega crafting and Rams purchases with progression requirements.
- [x] Waiting queues, process reservations, CPU/RAM admission and continuously empty-hunt cleanup.
- [x] Operator dashboard, Discord key distribution, monitoring and Windows server tooling.
- [x] Windows and Linux launcher builds; Windows, Linux and OpenBSD server-path checks.
- [x] Current server architecture guide, simplified documentation navigation and removal of provider advertising.

## Continue verifying

- [ ] Repeat end-to-end player tests after meaningful native, launcher or backend changes.
- [ ] Measure sustained combat capacity and queue wait times under realistic party sizes.
- [ ] Keep investigating reports involving part-break visuals, downed/zero-health recovery and long Escalation sessions.
- [ ] Verify recovery from interrupted downloads, client crashes, worker restarts and failed allocations.
- [ ] Exercise backup/restore and key-recovery procedures on disposable test data.
- [ ] Test complete game sessions on the Linux and OpenBSD/worker paths in addition to builds.

## Operating principles

- Test changes on an isolated account and environment before live rollout.
- Do not maximize player accounts as part of an ordinary deployment.
- A build proves compilation and automated checks, not every in-game scenario.
- Keep game downloads, server source, secrets and databases separate.
- Use maintenance or draining when restarting hunt services would end active hunts.
- No hosting-provider partnerships or endorsements are in effect.

## Documentation

Start with [how the server works](docs/server.md), [setup](docs/setup/index.md) and the [reference](docs/reference/index.md).
Source provenance and required licensing are recorded in [NOTICE.md](NOTICE.md) and [UPSTREAM.md](UPSTREAM.md).
