# Linux setup for 1.10.5

Launcher 1.0.52 keeps the native Linux account import, temporary sign-in when a
wallet is unavailable, isolated Proton prefix and game connection relay. The
Windows EXE running under Wine is not the recommended Steam Deck setup.

The Linux download page now offers a desktop setup file. It detects the distro,
downloads the matching release and checks its size and SHA-256. SteamOS gets an
AppImage, without changing the read-only system or requiring FUSE. The stable
`~/.local/opt/dauntless-unbroken-launcher/launch.sh` target can be added to Steam;
updates replace the AppImage without changing that target. Account keys and game
files are preserved. Desktop shortcuts forward Join links to the launcher.

Proton selection previously sorted entire paths. An older copy on an SD card
could win over a newer copy on the internal drive. Selection now compares tool
directory names, while explicit runtime overrides still take priority.

Validation: 15 Linux runtime, dependency and Wine-launch checks passed under
Ubuntu with Node 24.11.0. Four installer checks passed, including GLib desktop
entry parsing, a simulated installer download failure, and execution from a
different directory with spaces and an invite URL. Windows checks also passed.
These are automated checks, not a Steam Deck gameplay test. Gaming Mode input,
wallet access, sign-in and entering/returning from a hunt still need confirmation
on a real Deck using the current public build.
