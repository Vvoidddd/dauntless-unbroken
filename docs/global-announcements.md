---
title: Global in-game announcements
description: "Send restart and maintenance warnings to connected game chat sessions from the owner dashboard."
lang: en
ref: global-announcements
---

# Global in-game announcements

> Availability: this guide depends on [PR #47](https://github.com/Vvoidddd/dauntless-unbroken/pull/47). Until that implementation is merged and deployed, the dashboard control and metagame route described here are not available on the default branch.

The owner dashboard can send one message to every connected game chat session. It is intended for short restart, maintenance and service-status warnings. Sending a message does not restart a server, drain hunts or change the firewall.

## Before enabling it

Use a private server installation with:

- the metagame's administrator API key;
- the dashboard owner key;
- chat enabled and reachable by the game clients;
- the dashboard bound to loopback and reached through an SSH tunnel.

Keep both keys in private files. Do not put them in the browser URL, a public environment dump or a public gateway request.

## Start the dashboard

On the server, set the existing owner key and backend URL, then start the separate dashboard process:

```powershell
$env:DASHBOARD_OWNER_KEY_FILE = 'C:\DauntlessUnbroken\data\keys\owner.key'
$env:DASHBOARD_BACKEND = 'http://127.0.0.1:61000'
node tools/dashboard.mjs
```

The dashboard listens on `127.0.0.1:61110`. Use an SSH tunnel from the operator's PC:

```powershell
ssh -N -L 61110:127.0.0.1:61110 YOUR_SSH_USER@YOUR_VPS
```

Open `http://127.0.0.1:61110` and enter the owner key. The key is held in browser memory and is cleared by a reload or lock.

## Send a message

1. Open **Overview** in the dark owner dashboard.
2. Find **Global message**.
3. Enter a short warning, such as `Scheduled restart in 10 minutes. Finish your hunt and return to Ramsgate.`
4. Select **Send message** and confirm the prompt.
5. Check the result count shown by the dashboard.

The message is limited to 2,048 characters and rejects control characters. The dashboard sends it once and does not automatically retry a request whose result is unknown.

The result count is the number of connected chat sessions the metagame attempted to send to. It is not proof that a particular game client rendered the message. Confirm client display in a test environment before relying on wording or timing for a live notice.

## Restart-warning workflow

Send the warning before taking any separate maintenance action. A message only informs connected sessions; it does not pause matchmaking or stop active hunts.

For a planned restart:

1. Send the warning with the expected time.
2. Repeat the warning only when the schedule changes or the remaining time makes it useful.
3. Use the separate maintenance controls, if configured, to stop new hunt admission.
4. Verify active hunts and the server supervisor before restarting anything.

Do not use the announcement control as a substitute for a maintenance plan.

## Failure states

- **Announcement unavailable**: the dashboard could not complete the metagame request. Check the backend URL, the administrator key and metagame logs.
- **Result unknown; check before retrying.**: the request may have reached the metagame before the connection failed. Check server logs and connected clients before sending the same warning again.
- **No connected sessions**: the request can succeed with an attempted count of zero when nobody is connected.

This control is loopback-only by design. Do not expose the dashboard or the metagame administrator route through the public game gateway.
