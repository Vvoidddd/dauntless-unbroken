# Downloads and fleet status — November 2

The dashboard was reading retired 1.4.4 ports and performance samples. EU2's dashboard showed only its local host. The canonical fleet monitor now reads the 1.10.5 backend on 62000 and allocator on 62001; EU2's dashboard forwards authenticated status requests over a loopback SSH tunnel. Account and invite actions still use the local backend.

Public labels are Server #1 (EU1), #2 (UK key bot/storage), and #3 (EU2). Internal host IDs remain 1, 2, and 5 so existing routing stays intact. The Discord message uses the same fleet samples and identifies the realm as 1.10.5. Failed or stale readings stay unknown.

Verified live at 22:10 UTC: both dashboards and the existing Discord message showed all three hosts, 14 hunts and 33 players. Only dashboard/monitor processes were restarted. Game worlds and the backend stayed running.

## Deployment details

- Worker monitors accept `WORKER_DEPLOY_PORT=62001` and `WORKER_BACKEND_PORT=62000`.
- EU2 dashboard uses `DASHBOARD_FLEET_URL=http://127.0.0.1:62111`. EU1 forwards that listener to its canonical dashboard on 61110.
- The restricted SSH key needed an explicit loopback `permitlisten` for 62111. Existing restrictions were retained.
- The canonical and realm dashboard keys differ. `DASHBOARD_FLEET_KEY_FILE` supplies the canonical key; the browser still authenticates with the realm owner key. Key files are restricted to SYSTEM and Administrators and are not committed.
- The existing status-message ID was retained. No replacement message was created.

## Launcher 1.0.48

Bussy's 1.0.47 report contained `EPROTO` / `WRONG_VERSION_NUMBER` while fetching an audio pak. The object was present on Cloudflare and returned HTTPS 200 with byte-range support. The report does not establish whether the failure comes from a proxy, network interception or the TLS implementation.

CDN protocol errors now retry through Electron's Chromium network stack, which uses system network settings. HTTPS validation, manifest SHA-256 checks, resumable partial files and refusal of redirects remain in place. Public CDN requests carry no account key or session cookies. Hosted downloads now record individual retry reasons in support logs.

Validation: 50 fleet/dashboard/status tests passed; CDN tests covered TLS fallback, resume and corrupt-byte rejection. A real Electron request to Cloudflare resumed Version.txt after an injected Node EPROTO and matched its full SHA-256. That integration check also caught a recursive abort/destroy adapter; the final code calls Electron's native abort without replacing destroy.

Bussy still needs to retry on 1.0.48. A successful local download does not prove that their network-specific failure is resolved. Their support report remains open.
