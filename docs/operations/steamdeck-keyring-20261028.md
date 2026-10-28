# Steam Deck account import and key storage

A verified native Linux support report from October 26 contains alternating
`kwallet6, encryption available` and `basic_text, encryption unavailable` launches.
Its latest 1.0.39 native session forwarded 315 requests and one chat upgrade with
zero relay failures. An earlier failing launch still identified itself as1.0.33,
so users must check that the Steam shortcut points at their updated AppImage.
Private report evidence is stored outside Git in C:/dr/steamdeck-20261028.

Gaming Mode's Gamescope environment does not identify itself as KDE. Existing
startup repair selects GNOME/libsecret for GNOME desktops or a running GNOME
keyring, but did not select the installed KDE wallet in Gamescope. SteamOS now
selects the installed KWallet6 or5 daemon when no existing GNOME preference applies.
Explicit password-store command-line overrides remain respected.

After an account key has successfully loaded or been saved, the launcher records
only the working storage-backend name in linux-keyring.json. Later sessions use
that backend before Electron initializes secure storage. This receipt contains no
account key. An unavailable or incorrect backend is not persisted merely because
it is installed. basic_text and unknown backends cannot authorize encrypted key
storage; no plaintext fallback is enabled.

The registration and saved-account pages now offer an in-launcher multiline paste
alternative to the native file picker. It uses the existing bounded backup parser,
server fingerprint checks and account verification. Controller polling drops to
the inactive cadence when the launcher loses focus. This is not proof that the
reported game FPS problem is fixed.

Player procedure: launch the updated native AppImage in Desktop Mode, unlock the
desktop wallet, confirm the existing account, then add that same AppImage to Steam.
Use a Gamepad layout and leave forced Proton compatibility off for the AppImage;
the launcher selects Proton for the game. A locked/missing wallet can still require
Desktop Mode setup. Do not create a replacement account or factory-reset SteamOS.

The separate Windows-exe-under-Proton relay failure is not established as fixed by
these changes. Native Windows socket-owner checks remain unchanged. Real Steam
Deck Gaming Mode input, wallet access and game performance need a player retest.
