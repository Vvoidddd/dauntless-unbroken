---
title: Run a server
description: "How the Unbroken services, networking, database, hunt lifecycle and operator tools fit together."
lang: en
ref: server
---

# One realm. Several services.

Dauntless Unbroken separates persistent account data from temporary game worlds. The metagame owns the database; the deploy service starts game processes, and the launcher connects players through the gateway.

<div class="service-flow"><div><strong>Player → Launcher</strong><p>Account key, verified files, local relay and pinned TLS.</p></div><div><strong>Gateway → Metagame</strong><p>Authentication, saves, progression, social features and matchmaking.</p></div><div><strong>Allocator → Game worker</strong><p>One game process per world or hunt group, with capacity and lifecycle checks.</p></div></div>

## Choose a deployment

| Deployment | Guide | Game processes |
|:--|:--|:--|
| Windows Server | [Windows server kit]({{ '/setup/windows-server.html' | relative_url }}) | Native Windows 1.4.4 game executable |
| Linux | [Linux server]({{ '/setup/linux-server.html' | relative_url }}) | Windows game executable through Proton/Wine |
| OpenBSD control plane | [OpenBSD server]({{ '/setup/openbsd-server.html' | relative_url }}) | Separate Linux Proton/Wine worker |

These are supported code paths with different validation histories. A passing build does not establish that every host, driver or game scenario has been verified. No provider is partnered with or endorsed by this project.

Use a short source path such as `C:\dr\dauntless-unbroken`. Keep the deployed installation, configuration and database separate from that checkout.

## What each component does

| Component | Responsibility |
|:--|:--|
| `DauntlessUnbrokenLauncher` | Finds/verifies game files, stores account keys, configures the client and runs its local backend relay. |
| `DauntlessUnbrokenGateway` | Public TLS entry point, request limits and access controls; coordinates the player UDP allowlist. |
| `DauntlessUnbrokenMetagame` | Accounts, characters, inventory, Rams, quests, progression, loadouts, parties, friends and matchmaking. |
| `DauntlessUnbrokenDeployServer` | Allocates ports, starts game processes, checks readiness and monitors their lifecycle. |
| `DauntlessUnbrokenInternalServer` | Native integration loaded as `DauntlessUnbroken.dll` beside the pinned 1.4.4 game executable. |
| `DauntlessUnbrokenContent` | Serves the file manifest and launcher content; can advertise a separate HTTPS game-download base. |
| `DauntlessUnbrokenDiscordBot` | Account-key distribution through the backend; it does not hold a separate progression database. |

## Login and downloads

1. The launcher connects to the gateway using the certificate fingerprint in the realm invite.
2. The backend validates the account key. Game-server credentials and management routes are not accepted from public player traffic.
3. The launcher verifies the content manifest against its compiled game build.
4. With `CONTENT_DOWNLOAD_BASE_URL` configured, game files download directly over HTTPS from the R2 catalog. The CDN receives no account key.
5. During play, the game uses a relay bound to the player's own `127.0.0.1`. That relay carries backend and chat traffic through the pinned gateway.

Game downloads use `downloads.voidvault.xyz` on Cloudflare R2. The authenticated content service remains available as an operator-selected fallback. See [R2 downloads]({{ '/r2-downloads.html' | relative_url }}) for verification and rollback.

## Network boundaries

| Port | Purpose | Exposure |
|:--|:--|:--|
| TCP 443 | Gateway | Public TLS entry point |
| TCP 61000 | Metagame | Loopback/private tunnel; never a public backend listener |
| TCP 61001 | Deploy service | Loopback/private tunnel only |
| TCP 61002 | Content service | Behind the gateway |
| TCP 61005 | UDP allowlist helper | Privileged loopback service |
| Configured chat port | Chat listener in the metagame | Behind the gateway |
| Configured UDP range | Ramsgate, Training Grounds and hunts | Logged-in player addresses under the allowlist |
| TCP 22 | SSH operations and worker tunnels | Administrative access, separately controlled |

Exact ports and ranges are configurable. The deploy service has no player-facing authentication layer and must remain private. The operator dashboard is loopback-only and can be reached through a restricted SSH tunnel.

## Saves and server-side validation

One metagame database is authoritative for the realm. Workers run worlds against that backend instead of keeping separate player saves.

- Account and character ownership are checked on backend routes.
- Currency and inventory mutations are validated and persisted on the server.
- Store purchases use server-side pricing, balance checks and retry protection.
- Creator-code rewards are recorded per account so repeated submissions cannot grant the same reward again.
- Character version checks and transactional mutations protect against stale saves and repeated requests.

Back up the live database using the supplied backup tooling. Copying an open SQLite file without its consistency requirements is not equivalent to a verified backup.

## Hunts and queues {#hunts-and-capacity}

The metagame queues players and parties. The allocator asks an eligible worker for a world, waits for readiness and then hands back its address. A party of four in one hunt uses **one hunt process**, not four.

Admission depends on the configured process cap, CPU headroom, available memory, ports and in-flight starts. The current realm configuration pauses new launches at **80% CPU** and resumes at **79%**. Those deployment values can differ from code defaults.

A ready ordinary hunt is eligible for cleanup after it is continuously observed with zero connected players for **two minutes**. Unknown player counts do not prove vacancy; occupied hunts are not terminated merely because they are old. Ramsgate and Training Grounds have separate persistent-world handling.

A worker that is starting a world still consumes a reservation. Readiness failure and cancelled allocations must release reservations before another queued group can use the slot. Increasing a numerical cap cannot create CPU or RAM capacity.

## Operating the Windows stack

Run from an elevated PowerShell session on the host, using its actual installed root:

```powershell
C:\DauntlessUnbroken\bin\Stack.ps1 status -Root C:\DauntlessUnbroken
```

Check the supervisor, backend, content and deploy logs under the installation's data/logs directory. Keep account keys, game-server credentials, database exports and complete environment files private.

A component-only restart uses `restart -Only <component>`. Restarting the deploy/hunt services can end active hunts; changing documentation or publishing a launcher does not require that restart.

## Where to go next

- [Configuration]({{ '/reference/configuration.html' | relative_url }}) — environment settings and defaults.
- [Ports]({{ '/reference/ports.html' | relative_url }}) — network paths and firewall rules.
- [Files]({{ '/reference/files.html' | relative_url }}) — source, installed files and persisted data.
- [API]({{ '/reference/api.html' | relative_url }}) — game and operator routes.
- [Troubleshooting]({{ '/setup/troubleshooting.html' | relative_url }}) — symptoms, logs and recovery steps.
- [Security policy](https://github.com/Vvoidddd/dauntless-unbroken/security/policy) — reporting vulnerabilities.
