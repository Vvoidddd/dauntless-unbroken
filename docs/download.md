---
title: Download launcher
description: "Get the native Windows or Linux launcher. Linux setup selects the package for your distribution."
permalink: /download/
lang: en
ref: download
---

# Download Dauntless Unbroken

<p id="download-platform" role="status">Choose your operating system below.</p>
<a id="recommended-download" class="button button-primary" hidden></a>

## Windows

[Download the Windows installer](https://github.com/Vvoidddd/dauntless-unbroken/releases/latest/download/DauntlessUnbrokenLauncher-Setup.exe){: .button .button-primary #windows-download }

Run the installer, then open Dauntless Unbroken Launcher.

## Linux

**Use the native Linux launcher, directly from your applications menu.**

Setup detects your distribution, version and CPU architecture. Pop!_OS, Ubuntu,
Mint and Debian receive the DEB package; Fedora and compatible systems receive
RPM. Steam Deck, Arch and other compatible distributions receive an AppImage
with an application shortcut. SteamOS's read-only system is left untouched.

Open Terminal, paste this command, and press Enter. Enter your system password
if the native package installer asks. No package selection is needed.

```sh
( setup=$(mktemp) && trap 'rm -f "$setup"' EXIT &&
  curl -fL --proto '=https' https://vvoidddd.github.io/dauntless-unbroken/assets/install-launcher.py -o "$setup" &&
  python3 "$setup" )
```

Setup verifies the release package's size and SHA-256 before installation. It
does not change your accounts, keys, saves or downloaded game files. Import your
existing Unbroken account backup in the native launcher.

Requires Python 3, curl and x86_64 Linux. NixOS needs its [appimage-run setup]({{ '/setup/linux.html#nixos' | relative_url }}).

[Download Linux setup]({{ '/assets/install-launcher.py' | relative_url }}) ·
[Advanced Linux instructions]({{ '/setup/linux.html' | relative_url }}) ·
[All packages and release notes](https://github.com/Vvoidddd/dauntless-unbroken/releases/latest)

<script type="module" src="{{ '/assets/download-platform.js' | relative_url }}"></script>
