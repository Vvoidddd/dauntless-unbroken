# Client mods (UE4SS)

Optional client-side mods, installed automatically next to the game exe (`Archon/Binaries/Win64`):

- **UE4SS 3.0.1** (`dwmapi.dll`, `ue4ss/UE4SS.dll`; MIT, see `ue4ss/LICENSE`): the Lua mod loader.
- **Behemoth Health Bars**: a fixed HP and shield bar at the bottom of the screen (two bars when two behemoths are up).
- **Behemoth Tracker**: an arrow and distance to the behemoth in the top right.
- **Hunt Damage** (`DamageMeter`): a left-side panel with your core, part, stagger and wound damage,
  DPS since the first observed hit, each teammate's core damage/share, and the team's core total.
  Totals cover this visit to the hunt and reset for a new session. These are client observations:
  late joins, distant hits or lost network events can leave damage uncounted. Core damage alone
  determines DPS and contribution; the four overlapping channels are never added together.
  Home → Hunt Damage toggles the panel and team breakdown live. It keeps counting while hidden.
- **Mod Menu**: Home opens it, Up/Down (or PgUp/PgDn) choose, End flips the chosen switch. MODS turns
  whole mods on or off (applied after restarting the game); SETTINGS changes the mods live (shield bar, HP numbers,
  two bars in escalations, tracker at any distance, uncrafted weapon colour). Settings are saved in
  `ue4ss/Mods/shared/ModSettings/settings.txt` on each PC and never shipped or overwritten.
- **Uncrafted Weapons** (`CraftStar`): in the weapon crafting list, weapons you have never crafted get
  `>> ` in front of their name, in red, gold or purple (picked in the Mod Menu).

- **Lock-on** (`LockOn`): target lock-on. Middle mouse click (R3 on a gamepad)
  locks the camera onto the behemoth nearest the centre of the view and marks it with a white dot;
  press again to release. While locked the Slayer faces it. The Mod Menu's "Lock-on: change key"
  row picks other keys (kept in `ue4ss/Mods/LockOn/key.txt` on each PC). Unlike the others it
  changes your own camera and facing while locked; nothing is sent to the server.

- **PS5Icons**: PlayStation 5 button prompts and a DualSense picture for the Controls screen. They
  are not a UE4SS mod: the client DLL (`DauntlessUnbroken.dll`) shows them while a DualSense
  is connected. Artwork licence and attribution: [PS5Icons/LICENSE.txt](PS5Icons/LICENSE.txt).

They only change what you see on your own screen. The game works without them.

## How they get installed

- **Launcher**: on install, repair and before every launch (`DauntlessUnbrokenLauncher/src/main/client-mods.ts`).
- **Friend kit**: `friend-kit/setup.ps1` (skip with `-NoMods`).

Both install only files whose SHA-256 matches `manifest.json`, and check them again after copying.
`ue4ss/UE4SS-settings.ini` preserves existing preferences, except that Lua hot reload and automatic script reload are forced off to prevent live Lua-state teardown crashes. **Ctrl+R safely refreshes the mod menu and settings; restart the game to apply whole-mod on/off changes.** Existing `mods.txt` switches are kept; new bundled mods are added and retired mods are disabled. Mods are Windows only: under Wine/Proton UE4SS is not loaded.

The launcher puts deleted files back before the next launch. To turn a mod off, use the Mod Menu or
set it to 0 in `ue4ss/Mods/mods.txt` (that file is kept).

## Changing a mod

Edit the files here, then rebuild the manifest and commit both:

    powershell -ExecutionPolicy Bypass -File client-mods\update-manifest.ps1

`.gitattributes` keeps every file byte-for-byte, so the hashes stay valid on every checkout.

Updates preserve existing mod switches, add newly shipped mods to `mods.txt`, and disable the retired status indicator. CraftStar is added before Keybinds on existing installations; an explicit CraftStar off setting is preserved.

Damage meter regression check (Lua 5.4): `lua tests/client-mods/damage-meter.lua` from the repository root.
