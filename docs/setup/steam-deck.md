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
Select the file. The backup includes the server address and original certificate,
so a complete backup does not need another Join invite. The same import button
also remains visible on the registration screen. Check your Slayer name before playing.

If you have only the raw `UUK_…` account key, select your server with its original
Join invite, then open the **Account key** field and paste the key. Do not press Register.

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

Use Steam Input's gamepad layout for gameplay and touch/trackpad input for launcher
forms. The launcher provides larger touch targets on touch displays.

If something fails, report the launcher version, Desktop or Gaming Mode, Proton
version and exact error. Do not post your account-key file or a screenshot containing it.
