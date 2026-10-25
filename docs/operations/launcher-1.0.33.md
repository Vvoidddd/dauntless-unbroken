# Launcher 1.0.33

Startup and launch checks now cover:

- Failed Offline journal recovery keeps online startup usable; Offline retries recovery before starting services.
- Game-folder discovery releases Browse after ten seconds and ignores late scan results.
- Linked Proton directories are detected; dedicated Linux servers do not count as running game clients.
- AppImage recovery and update restarts target the persistent AppImage file, preserving safe-mode arguments.
- Renderer-crash recovery waits for active account/save operations, downloads and game sessions instead of force-exiting them.
- Linux opens its window before optional keyring installation; account mutations stay locked until that step finishes. SteamOS keeps its existing no-package-install policy.

Earlier regressions remain covered by tests: stalled key backups during registration,
disabled saved regions, and actual account-switch IPC callbacks. The client DLL stays
on the stable 1.0.28 artifact; reported 1.0.29 hunt-exit crashes did not establish
native-hook causation without a crash dump.

These checks do not establish the cause of GadisManjahh's AppImage crash. Its native
terminal error or a real Steam Deck reproduction is still required.
