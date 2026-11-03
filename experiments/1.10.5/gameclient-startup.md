# Legacy IGameClient startup warning

Launcher 1.0.51 uses the 1.10.5 legacy EAC client's existing `-NoEAC` exit path. The warning was coming from that plugin's failed `CreateGameClient` factory, not Unbroken's account or game-server connection. Players reported that dismissing it allowed them to play.

The launcher already passes `-NoEAC`. We have not established why the plugin still reaches its factory on affected installations. The client bootstrap now makes the native skip deterministic: after checking the full game EXE hash, it replaces the `74 35` branch at RVA `0x13645e1` with two NOPs. Execution falls through to the plugin's own skip/log/return path. The direct factory-loader call at `0x1364d77` is downstream of the skipped setup. Dedicated servers do not apply this patch; authentication and connection error handlers are unchanged.

Run `python experiments/1.10.5/check-gameclient-init.py [path-to-game-exe]` to verify the branch, return path and executable identity. This is specific to build 365075, SHA-256 `41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd`; other builds need fresh analysis. A successful client bootstrap logs `legacy_gameclient_init_skipped`.

Validation: compiled the release DLL and checked the pinned executable's control flow. The packaged game still needs an affected player's restart to confirm the popup is gone. Updating a launcher does not replace a DLL already loaded by a running game.
