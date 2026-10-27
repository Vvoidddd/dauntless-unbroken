# Discord key distribution

The member counter uses three locked voice channels under `───📊 Discord Statistics 📊───`:
`»»—Dauntless Unbroken—««`, `🟢online ⛔busy 🌙idle`, and `🌐total 👤members 🤖bots`.
Existing counter channel IDs are reused. Statuses count human members visible to the bot;
offline/invisible members are excluded from the status row, but remain in member totals.
Enable **Server Members Intent** and **Presence Intent** in the Discord Developer Portal.
The bot detects newly enabled intents and reconnects automatically; missing Presence Intent
shows dashes rather than fabricated zeroes and does not stop key distribution. Updates are
batched every five minutes to limit voice-channel renames.

Run alongside the metagame with Node 22.12 or later. Copy `.env.example` to `.env`, set the Discord bot token and a metagame admin key, then run `npm ci` and `npm start`. Keep `.env` and the state directory private and outside Git. Back up the state with the game database; a corrupt state file stops issuance rather than starting over.

The bot registers `/key claim` and `/key status` without replacing its other commands. Invite the bot with the `bot` and `applications.commands` scopes. It needs no message-content intent. Commands work in the server and in bot DMs. Codes are sent only by DM; command acknowledgements are private.

`/key claim` DMs a complete `dauntless-unbroken://join?...` **launcher invite** containing a single-use registration code. Paste the entire invite into **Join**, then choose a username on **Register**. The launcher receives and saves the actual account login key after registration. A bare `DR-...` code is not a server invite or an account key. Each Discord user receives one invite. Failed DM delivery retries use that same unused invite; confirmed DMs are not sent again. Users previously given an ephemeral invite can run `/key claim` to receive that same unused invite once by DM. The bot does not delete DMs. Redeemed or revoked codes are never replaced automatically.

Set `SERVER_CONFIG_FILE` to the installed public server's private `server.json` (normally `C:/DauntlessUnbroken/data/config/server.json`). The bot reads `PublicHost`, `Ports.gateway`, `CertFingerprint`, and `ServerName` to build the same v2 invite as the dashboard. Restart the bot after a host or certificate change. Always point invites at the main TLS gateway: overflow hunts are selected by the backend, not by sending users a second server invite. The current bot invite builder requires a public gateway; a Tailscale-only installation should use its kit-generated private invites.

New registration codes use hexadecimal randomness, because the launcher accepts letters, digits and hyphens only. Existing unused codes from earlier versions containing `_` need an operator repair before they can be placed in an invite. Back up the bot state and database together, pause bot issuance during repair, and never rotate an existing account's login key. Users who already received a bare code can run `/key claim` again to receive its complete invite.

The bot's admin key is sent only to loopback HTTP. Configure `KEY_STATE_FILE` outside the application directory on deployments so code updates do not erase claims. Run one instance, with filesystem permissions limited to its service account and administrators. Never paste a bot token into `.gitignore`; ignore the file containing it.
# Link an existing launcher account

Run `/key link key:<your launcher account key>`. The bot verifies that key against
the central account service and replies ephemerally, visible only to the caller.
The metagame database stores the Discord ID, account UID and link time; it never
stores or echoes the submitted launcher key. Existing keys and saves are unchanged.
Verified links from the earlier bot state migrate automatically at startup.
`/key status` reads the central database to confirm the account link.
An account and Discord ID can each have only one link; conflicting changes require
the server team. Registration invite codes cannot be used as launcher account keys.

Older `dauntless-unbroken://join?...` links are registration invites, not account credentials.
For an already registered account, use **Launcher → Settings → Save a backup of your key…**, open
the saved file, and copy the value after `Key:` into `/key link key:`. The bot also
accepts a labelled backup or a key wrapped in Discord backticks. It never links an
account by display name or by a shared/redeemed invite, and never replaces its key.

Registration keeps `/key` available globally for DMs and registers a server copy immediately, alongside `/ban` and `/unban`. Existing command IDs and unrelated commands are preserved. Invites issued by `/key claim` are bound to the Discord user; registration atomically links the new game account to that identity. Existing accounts can use `/key link` with their saved account key.

## Moderation and owner controls

`/ban user:<Discord user> reason:<reason>` permanently blocks their Discord account, linked game account and new invite claims. `/unban` revokes both restrictions. Both require **Ban Members**, respect Discord role hierarchy and protect game administrator accounts. The default is **account-only**; `ip:true` additionally blocks a recently observed game IP. Offline users without a recent trusted IP can still receive an account-only ban.

The same reason appears in the private dashboard, launcher access refusal and game authentication refusal. The backend commits the game restriction first and stores a durable Discord action. The bot retries unsynchronized actions every 15 seconds; the dashboard distinguishes pending, completed and failed Discord synchronization. A Discord API failure does not silently undo the game ban. Keep the bot role above players and grant Ban Members.

The dashboard's **Players** page supports verified manual Discord linking/unlinking, login-key revocation/replacement, unused-invite revocation and Discord/game bans. **Access** can create a single-use invite bound to a Discord user ID. Revoking a key invalidates previous sessions and recovery copies without deleting progression. Administrative accounts are protected. Keys are private credentials: replacement keys are shown only to the authenticated owner, never in audit logs. All access changes require an audit reason. Unlinking an identity does not unban either account or issue another invite.

## Windows supervision

`Run-Bot.ps1` runs Node with `data/config/discord-keys.env` on every attempt;
interactive shell variables are not required. Keep that file private and outside
Git. Set `-Root` and `-Node` if the installation differs from the defaults.
Run the script from a single startup scheduled task with no execution time limit,
`IgnoreNew` instance policy and restart-on-failure enabled. The script retries bot
exits with a 5–60 second delay, including temporary backend outages at startup.
`discord-keys-supervisor.log` records exits; stdout/stderr logs describe the latest
attempt. Stop the scheduled task and its bot process before maintenance.
