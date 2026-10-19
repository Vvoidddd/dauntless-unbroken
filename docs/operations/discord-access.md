---
layout: default
title: Discord access and moderation
description: Account-bound invites, game and Discord bans, and manual access administration.
---

# Discord access and moderation

The UK key bot registers `/key`, `/ban` and `/unban` in the Discord server. `/key` also works in bot DMs. Install with the `bot` and `applications.commands` scopes. The bot needs **Ban Members** and a role above members it moderates; callers also need Ban Members and must outrank their targets.

`/key claim` privately delivers one saved launcher registration invite. The backend binds it to the caller's Discord ID and links the resulting account during registration in the same transaction that consumes the invite. Retrying does not mint another invite. Revoked and used invites cannot be replenished by repeated claims. Existing accounts use `/key link` with their saved account key after verifying ownership.

Use `/ban user:<member> reason:<reason>` for a permanent Discord and linked game-account ban. The default is account-only. Select `ip:true` only when an additional IP restriction is intended; it requires a recently observed game connection and can affect people sharing that connection. `/unban` revokes the Discord and linked game restriction. Administrator game accounts are protected.

Game restrictions commit before Discord synchronization. Discord changes remain in the database until acknowledged by the bot; pending actions are retried every 15 seconds. The dashboard shows the latest reason, operator, revision, sync status and any Discord permission failure. A failed Discord action never implies that game access was restored. Backend authentication returns `account_banned` with the reason; revoked credentials return `session_revoked`. Launcher 1.0.6 already displays account-ban reasons.

In the private dashboard, open **Players** to select an account, link or unlink a verified Discord identity, revoke or replace login keys, revoke an unused Discord invite, or ban/unban Discord and game together. Provide an audit reason. Key revocation removes login and recovery credentials and invalidates existing sessions; it preserves characters, inventory and progression. Replacement keys must be shared privately with the verified owner. **Access** can generate a single-use invite for a specific Discord user ID.

All operator APIs require the owner key on the private backend connection; public gateway requests and ordinary player keys are refused. Keep the dashboard accessible only through the private localhost SSH tunnel. Never share owner keys, bot tokens or player login keys in public channels.
