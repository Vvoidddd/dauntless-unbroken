# Security review — 20 October 2026

The review covers the 49 open CodeQL alerts (#3–51) and dependency pull requests #16–20. Alert dispositions must be checked against a fresh analysis of the final commit; a successful build alone does not prove an alert is resolved.

## Changes

- Backend identity lookup returns the persisted `users.userId`, never the credential used to look up that identity. This removes the development `AUTH_MODE=NONE` credential-to-identity flow behind the logging reports without deleting useful player diagnostics (`DauntlessUnbrokenMetagame/src/controllers/unbrokenapi.ts`).
- Backend logging redacts issued/imported `UUK_` keys, JWT-shaped strings, credential fields and error text. The shared redactor also handles long malformed JWT prefixes without repeatedly scanning the same suffix. Regression tests cover 300 KB of repeated prefixes, rotated keys, structured credentials and null errors (`src/credential-redaction.ts`, `src/logger.ts`, `test/logger.test.ts`, `test/platform.test.ts`).
- Dashboard Discord-account actions use fixed loopback URLs and validated numeric IDs; JSON bodies must be objects. Malicious URL/path IDs and non-object bodies are rejected (`tools/dashboard.mjs`, `tools/dashboard.test.mjs`).
- Chat-wire tests compare domain-containing text literally; the only ping-pattern expression validates its numeric request ID (`DauntlessUnbrokenMetagame/test/chat.test.ts`).
- Dependency updates: DeployServer `better-sqlite3` 13.0.3, Metagame `dotenv` 18.0.7, launcher `@electron/fuses` 2.1.3, Forge fuse plugin and RPM maker 8.0.1. Launcher version: 1.0.11. The existing Forge CLI remains in place; the updated maker/plugin interfaces are validated by actual packaging.
- Relay tests use OS-assigned listener ports to avoid Windows excluded-port ranges. The Windows ownership test receives application data before checking ownership, matching the production HTTP request boundary. Exact peer tuple/PID rejection remains unchanged.

## Intentional exceptions requiring an explicit disposition

| Alerts | Evidence and scope |
| --- | --- |
| #34–36: password-hash rule | These SHA-256 values fingerprint opaque API keys, not human passwords. Registration creates 24 cryptographically random bytes; rotation creates 32. Server installation generates 24 random bytes using `RandomNumberGenerator`. Recovery must preserve the same fingerprint for its account-key join. Imported weak keys must be rotated; the entropy argument does not apply to them. See Metagame `controllers/accounts.ts`, `keyrotation.ts`, `auth.ts`, `apikeys.ts`, `accountrecovery.ts`, and `deploy/windows-server/Install-DauntlessUnbrokenServer.ps1`. |
| #12: disabled CA validation | `pinnedConnect` verifies the SHA-256 fingerprint of the actual peer certificate before handing the socket to HTTP. An absent/mismatching certificate destroys the connection before request data is sent. This intentionally supports self-signed invite certificates, with TLS 1.2 minimum. See launcher `src/main/pinned.ts` and `test/pinned.test.ts`. Reassess if callers can bypass this gate or pins are obtained from an untrusted source. |
| #3–11: disabled CA validation in tests | Gateway tests use throwaway certificates on loopback for raw TLS, pin mismatch and connection-limit tests. These are test fixtures, not production client policy. See Gateway `test/testhelpers.ts`, `gateway.test.ts`, `limits.test.ts`. Reassess if copied into production connections. |
| #13–14: clear-text logging | Registration logs only `APIKeysToRegister.length` (an integer count), never the key strings. See Metagame `controllers/auth.ts` and `controllers/apikeys.ts`. Reassess if the logged expression changes. |

These exceptions are not evidence that arbitrary password hashing or unverified TLS connections are safe. Preserve the stated guards and their negative tests.

## Validation

Local checks: 843 Metagame tests, 108 DeployServer tests, 100 Gateway tests, 17 dashboard tests, and 333 launcher tests passed (three platform skips). Windows Squirrel/ZIP packaging completed with the upgraded dependencies. CI and fresh CodeQL analysis are required before completion. Packaged offline verification also checks native SQLite loading, account/key stability across restarts, secret-free output and release of owned service ports.
