# Installer and dependency review — 2 November 2026

The public game download remains on `https://downloads.voidvault.xyz/1.10.5/`, with the existing file hashes and resume support.

## Installer

The supplied Squirrel log belonged to SignalRGB, not Unbroken. The local Unbroken logs showed two overlapping 1.0.45 installer attempts failing while removing the same old installation files. A later 1.0.45 retry succeeded. The official 1.0.46 installer was downloaded, hash-checked against its release, installed successfully and opened with the existing account intact. This does not identify the cause on every affected player's PC.

The 1.0.47 dependency update aligns Electron Forge packages at 8.0.1 and Electron at 44.10.1. Forge 8 emits `main.cjs` and `preload.cjs`; both application references must change together. Packaging now checks that the referenced main and preload exist in the actual ASAR before producing release artifacts. The packaged Windows launcher opened on a disposable profile, and the 1.0.47 Squirrel installer completed successfully locally.

An audit-only dependency install with scripts disabled left Squirrel's `7z.exe` absent. `npm rebuild electron-winstaller` restored its architecture-selected helper and the installer build succeeded. Normal CI uses `npm ci` with install scripts enabled. Do not work around this by substituting unrelated archiver binaries.

## Server request limits

Public forwarded JSON requests are limited to 128 KiB after decompression, matching the gateway's wire-size budget. Direct world-server batches retain the existing 50 MiB budget and compressed requests remain supported. This distinction relies on the backend being private behind the gateway.

Character saves are bounded at 256 KiB before parsing and after appearance preservation. Character creation validates names, caps accounts at eight characters transactionally, and uses the existing player mutation rate limiter. Invalid saves leave both current data and history unchanged. The live read-only sample contained 137 characters, one per account; the largest current save was 70,172 bytes and the largest history record was 70,218 bytes. Recheck the limit if the native save format grows.

## Validation and remaining findings

- Metagame: 913 tests passed; gateway: 104; allocator: 121; Discord bot: 49.
- Launcher: 420 passed, three skipped, zero failures; typecheck passed; Windows ZIP and Squirrel build succeeded.
- The announcement-workflow check passes with a checkout of the repository's trusted default branch (`1.10.5`), never a pull request's head.
- npm audits reported zero vulnerabilities for Metagame, DeployServer, Gateway, DiscordBot and Content. Launcher production dependencies also reported zero.
- The full launcher build dependency tree still reports 24 moderate findings through glob/minimatch and their dependent tools. There are no reported high or critical findings in that audit. Do not apply a global major-version override: older Squirrel tooling uses callback-era glob/rimraf APIs. These build-tool findings remain open pending compatible upstream updates or a separately tested replacement.
- GitHub security-alert API access was denied for the available credential. These checks do not establish that all GitHub alerts are cleared or that the application is free of vulnerabilities.

Live deployment and client release publication must be verified separately from these local checks. Gameplay fixes and crash investigations remain separate work.
