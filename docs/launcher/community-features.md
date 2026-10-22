---
title: Community features
description: Lock-on controls, DualSense reconnection, and playtime milestones.
---

# Community features

Dauntless Unbroken includes lock-on controls, DualSense reconnection and playtime
milestones. Applicable software notices are linked from the
[license page]({{ '/legal.html' | relative_url }}).

## Lock-on

On Windows, press the middle mouse button or R3 to lock onto a nearby Behemoth.
Press it again to release. The camera follows the target, and your Slayer faces
it while moving sideways. Moving backwards lets you run away normally. Lock-on
releases when the target dies, leaves range, or its camera/position becomes
unavailable. It changes your local camera and facing, not combat statistics.

Open Client Mods with Home, select Lock-on or its key setting, then use End.
Keyboard/mouse and gamepad bindings are separate and survive launcher updates.
Linux does not load the bundled Windows client mods.

## DualSense

The Windows client DLL notifies the game after a newly connected DualSense sends
its first valid report. You can connect or reconnect the controller while the
game is running. This does not require a server DLL restart.

## Playtime

Settings → Account shows online and offline hours, sessions, the last session,
and hour milestones from 1 to 1,000 hours. Achievements use text and progress
bars; no achievement artwork is bundled.

Online time is counted by authenticated player heartbeats on the selected
server. Milestones use confirmed server totals, not the launcher's session
clock. Tracking starts when the server installs this feature; earlier hours
cannot be reconstructed from the launcher. Long heartbeat gaps do not count.
Offline time remains in the separate offline save and its backups. Offline
hours do not unlock online milestones. The milestones are informational and
do not grant in-game currency or items.
