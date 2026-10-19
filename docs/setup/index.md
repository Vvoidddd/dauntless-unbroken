---
title: Start playing
description: "Install the Unbroken launcher, sign in, reuse game files and join your first hunt."
permalink: /setup/
lang: en
ref: setup/index
---

# Start playing

Use the Dauntless Unbroken launcher with an Unbroken realm invite and your personal account key. The supported game build is **Dauntless 1.4.4**.

## 1. Install the launcher

Download the latest release from [GitHub](https://github.com/Vvoidddd/dauntless-unbroken/releases/latest).

- **Windows:** run `DauntlessUnbrokenLauncher-Setup.exe`, or use the portable ZIP.
- **Linux:** choose an AppImage, DEB, RPM or portable package and follow the [Linux guide]({{ '/setup/linux.html' | relative_url }}).

Keep the launcher open while playing: it carries the game's backend and chat traffic over the realm's encrypted connection.

## 2. Sign in

Add the realm invite, then enter your existing account key or register when registration is available. A key belongs to its realm; a key from another service does not transfer your account.

The launcher automatically saves a readable recovery file to your **Desktop** after successful registration or key sign-in. It also keeps encrypted local storage. If Desktop saving is unavailable, use **Save key backup**. Anyone who has the key can access your account, so keep the file private.

The Unbroken realm started with new accounts and progression. Previous realm saves are not imported.

## 3. Confirm your game folder

The launcher checks common local folders for the supported executable before offering a download.

- If it finds the game, it shows the location and asks whether you want to use it.
- Confirming verifies the full file list, downloads missing or different files and installs the Unbroken DLLs.
- Choose a different folder to keep a separate installation.
- For an unusual location, use **I already have the game files** and browse to `BaseGame144`, its `Dauntless` folder, or the game's `Win64` folder.

No discovered installation is changed before confirmation. Copy an installation first if another setup still uses it.

## 4. Download what is missing

The realm advertises its R2 game catalog through the content manifest. Downloads can resume and every completed file must match the launcher's compiled size and SHA-256.

The correct folder contains `Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe`. A newer retail build cannot substitute for the pinned 1.4.4 executable.

## 5. Play

Press **Play**. If Ramsgate or hunt capacity is full, stay in the queue; available capacity is allocated to eligible waiting players and groups.

For a problem, use the [troubleshooting guide]({{ '/setup/troubleshooting.html' | relative_url }}). Operators should use [Run a server]({{ '/server.html' | relative_url }}).

## Offline play

Offline mode starts local services with a separate account and database. Online and offline saves are isolated. Exporting or importing an offline save does not upload that progression to the public realm.
