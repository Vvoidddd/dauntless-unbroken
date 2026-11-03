# Launcher 1.0.49 download fix

The 1.0.48 report from a failed game install showed Node HTTPS failing with
`EPROTO WRONG_VERSION_NUMBER`, followed by `net::ERR_BLOCKED_BY_CLIENT` on every
Chromium retry. All 606 public R2 object sizes checked correctly.

`hardenSessions()` in `DauntlessUnbrokenLauncher/src/main.ts` intentionally blocks
network requests in the renderer's default Electron session. The new Chromium
download fallback accidentally used that same session. It now uses the separate,
non-persistent `unbroken-cdn` partition. Renderer restrictions remain unchanged;
CDN requests still require HTTPS, omit credentials and cookies, reject redirects,
and verify each file's SHA-256.

Validation: 15 downloader tests and TypeScript passed. After compiling the tests,
run `npx electron scripts/check-cdn-session.cjs` from the launcher directory
(unset `ELECTRON_RUN_AS_NODE` if set). This check blocks the default session,
forces a Node TLS failure, then resumes and verifies the real R2 `Version.txt`.
It failed with `ERR_BLOCKED_BY_CLIENT` without the partition and passed with it.

This confirms the fallback regression. It does not identify the player's original
Node TLS failure or guarantee every network can reach R2. Keep unresolved player
reports until the updated launcher succeeds on their connection.
