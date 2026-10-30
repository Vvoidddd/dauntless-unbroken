---
title: Steam Deck
parent: Setup
nav_order: 4
description: Keep your existing Slayer on Steam Deck, import a PC account backup, and launch through Steam and Proton.
lang: en
ref: setup/steam-deck
---

# Steam Deck

Use the **Linux x86_64 AppImage** or portable Linux archive from the
[latest launcher release](https://github.com/Vvoidddd/dauntless-unbroken/releases/latest).
The launcher is a native Linux application; it starts the Windows game through Proton.

## First setup in Desktop Mode

1. Open Desktop Mode and download the AppImage. In its file properties, allow it
   to run as a program, then open it. The portable Linux archive is another option.
2. Ensure a Proton version is installed through Steam. The launcher detects normal
   Steam and Flatpak Steam installations, including Proton stored in libraries on an SD card.
3. Follow the account steps below, then let the launcher download or verify the game.
   Its default game folder is `~/Games/DauntlessUnbroken`; you can choose a folder on your SD card.
4. Keep the launcher running while playing: it provides the game's connection to the server.

SteamOS does not need its read-only system image disabled. The launcher does not
attempt automatic system package installation on SteamOS.

## Keep the same account as your PC

**A Join invite is single-use registration. An account key signs into the same
Slayer on another device. Do not register another account to transfer your progress.**

On your PC, find the `Dauntless Unbroken key - … .txt` file on your Desktop, or
open launcher **Settings → Account → Save a backup of your key**. Transfer that text
file privately to your Steam Deck's Desktop or Downloads folder.

On the Deck, choose **Import account backup…** on the launcher's first screen.
Select the file from the in-launcher list of small text files in Desktop,
Downloads or Documents. The import stays in the same window in Gaming Mode;
you can also paste the backup or import it from the clipboard. The backup includes the server address and original certificate,
so a complete backup does not need another Join invite. The same import button
also remains visible on the registration screen. Check your Slayer name before playing.

If you have only the raw `UUK_…` account key, select your server with its original
Join invite, then open **Account key** and paste the key. Do not press Register.

If KDE Wallet is unavailable, select **Sign in until launcher closes** before
importing. This explicitly keeps the validated key in memory for this launcher
session, without saving a new key or replacing a saved account. Keep your backup:
after closing the launcher you must import it again. Leave the checkbox off for
normal encrypted storage when your wallet is available.

Online progression stays on the shared server. An account-key backup signs into
that progression; it is not an offline save export. Offline saves remain separate.

## Get another private copy from Discord

Use **`/key resend`**. For a verified linked account, the bot sends the existing
account key and a downloadable `.txt` backup. It does not rotate the key, invalidate
your PC's copy or create another Slayer. An unused registration invite is resent
as the same unused invite.

New accounts registered through the bot's owned invite are verified automatically.
Older accounts may need one verification: use **`/key link`** with your existing
account key, then **`/key resend`**. The bot can answer privately in Discord if DMs
are disabled. Requests are limited to prevent spam; restricted accounts cannot obtain copies.

**Your key is linked to your Discord account. Keep it private. If another player
misuses it, your access/key may also be revoked. Use it only on your own devices.**

## Open it from Gaming Mode

After Desktop Mode setup, add the **Linux launcher/AppImage** as a Non-Steam game
in Steam, then launch that shortcut from Gaming Mode. Do not force a Windows
compatibility tool on the Linux launcher itself; the launcher selects Proton for the game.
Valve documents the Desktop Mode and Non-Steam application flow in its
[Steam Deck desktop FAQ](https://help.steampowered.com/en/faqs/view/671a-4453-e8d2-323c).

Use Steam Input's gamepad layout for gameplay. The launcher also accepts a standard
controller on Windows and Linux: D-pad or left stick moves focus, A selects, B
goes back, and LB/RB moves through controls. Right stick or triggers scrolls.
Selecting a text field opens an on-screen keyboard; Done saves and B cancels.
Mouse and touch input remain available. Account backup import uses an in-launcher
file list. **Browse another folder (Desktop Mode)** opens the optional system
picker; in Gaming Mode, put the backup in Downloads or paste it instead.
Physical controller layouts can vary.

If the launcher closes immediately in Gaming Mode, install launcher 1.0.34 or
newer from Desktop Mode. Its Linux entry point keeps Steam's overlay out of
Electron startup, while preserving the overlay and Steam Input environment for
the game. Keep the shortcut pointed at the AppImage or
`DauntlessUnbrokenLauncher`, rather than the internal `.bin` executable.

For missing sticks or buttons, open the same Steam shortcut in Desktop Mode as
well as Gaming Mode and select a Gamepad controller layout in Steam. Opening the
AppImage directly outside Steam can use the Deck's desktop button mapping.
Send a new support report if controls still fail through that shortcut; a
successful game launch alone does not confirm controller input.

When setting AppImage permissions in a terminal, `chmod +x` needs a space before
the filename. Type `chmod +x `, drag the AppImage into the terminal, and press Enter.

## Purchases, queues and support

**Settings → Account → Recent purchases** loads recent recorded purchases for the
current account. Receipts show costs, delivered items and transactions needing
review. A missing delivery record is a support lead, not an automatic refund.

While queued, the launcher shows player/group position, elapsed wait and why it
is waiting. An estimate appears only when recent admissions provide enough data;
it is not a reserved arrival time. Existing queue order remains in effect.

**Settings → Launcher → Support diagnostics** saves a local JSON support file.
It includes bounded launcher logs and basic runtime state, with account keys,
tokens and local user paths removed. It does not collect saves, the database or
account-key files, and it does not upload anything automatically.

If something fails, report the launcher version, Desktop or Gaming Mode, Proton
version and exact error. Do not post your account-key file or a screenshot containing it.
