# Launcher 1.0.34

GadisManjahh's Steam Deck report identifies a Gaming Mode SIGSEGV inside
`gameoverlayrenderer.so` while Electron's zygote is starting. The Desktop Mode
report reaches the game through Proton with 216 relay requests, one upgrade and
zero relay failures. It also records competing AppImage `.new` rename/chmod
failures. These are distinct from the reported partial controller input.

Linux packages now enter a shell bootstrap before Electron. It removes only
Steam overlay entries from the launcher's `LD_PRELOAD`, saving the original for
Proton/Wine. The game retains Steam/controller/runtime variables. Chromium's
sandbox and Electron fuses remain enabled. AppImage, portable, deb/rpm entry
points and relaunch/protocol registration use the bootstrap.

Both update buttons use the shared controller maintenance lock. Installation is
awaited, failed attempts release the lock, and AppImage replacement uses a unique
sibling file plus atomic rename. Failed staging and AppImage download temporaries
are cleaned up. The original AppImage remains intact if staging fails.

Settings → Launcher includes the Steam Deck control setup: add the native
launcher to Steam, leave forced compatibility off for the launcher, and select a
Gamepad layout for that shortcut. Desktop launches outside Steam can use desktop
button mappings. Physical Deck sticks/buttons still require player confirmation.

Validation: Windows 406 passed / 3 platform skips; Linux 400 passed / 9 platform
skips. The packaged Linux launcher opened under Xvfb with the sandbox retained,
showed the Deck help and exercised existing removal/cancel IPC. A synthetic
`gameoverlayrenderer.so` loader probe exits 119 when injected into the real
Electron binary; the canonical wrapper successfully starts the interface under
the same preload. This verifies isolation before Electron startup, not the
proprietary overlay's implementation or real Deck hardware.

The packaged real binary retains all configured security fuses. Its stable
client DLL remains SHA-256
`74d18637a0b317d8c799e62b69ceba1d827c5718ae6ac966e45467bdc48ab54a`.
Pangar's server-only artifact is documented separately in
[Pangar frostbrand damage](pangar-proc-flat-damage.md).

A Linux relay streaming regression test used wall time and observed a negative
elapsed interval after a VM clock adjustment. It now uses monotonic elapsed time
with the same streaming thresholds; relay behavior is unchanged.
