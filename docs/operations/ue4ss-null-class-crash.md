# UE4SS null-class crash investigation

Nyxxie's support report `3bc33857-307b-4074-816c-a93fa2e131d1` identifies launcher
1.0.39 and two game exits with code3. The local crash contexts identify Terra Escalation
and an access violation reading0x18. The uploaded report contains launcher logs only;
the native dumps and UE4SS log were recovered separately on this PC.

The preserved latest minidump resolves UE4SS RVA2accf3 to its Lua GetFullName wrapper,
then RVA3e0e13 to native UObject::GetFullName obtaining the object's class name.
The failing engine instruction reads `[rcx]` with rcx=0x18, consistent with a null
class plus the FName offset. ProcessEventClientHook appears lower in the intercepted
event stack; that alone does not identify it as the cause. The compact dump does not
contain enough Lua heap data to identify the exact script/object responsible.

FrameTick.Valid now requires both a live object and a live class before native access.
FrameTick.ObjectKey uses checked addresses and the object's own FName for identity;
no shipped mod calls native GetFullName or GetPathName. Ownership matching uses a
bounded, checked GetOuter chain rather than string-prefix comparisons.
In particular, the health-bar attribute-set and tracker marker searches previously
called GetFullName without validating each candidate. Lua pcall does not contain a
native access violation. The earlier dump also fails inside GetPathName during the
same GetFullName call, so a class check alone is insufficient. Removing deep name/path
calls avoids both observed paths; it does not establish universal native memory safety
or identify the exact originating Lua mod from the compact dump.

The regression models a non-null, IsValid-true object with no class and asserts its
GetFullName is never called. Destroyed objects, address reuse with new names, broken
outer chains/cycles, nested ownership, travel, dual groups,
regrowth and wounds remain covered. Part polling is reduced from4Hz to2Hz to lower
the native-call cost on weaker PCs; input and tracker movement retain their cadence.

Local containment switches DamageMeter, PartMonitor and the unshipped KharabakVfxProbe
off in mods.txt, with the original file backed up. The probe also had direct native
name calls and remains disabled during isolation. Native baseline and guarded-HUD
retests are required before claiming the crash fixed or publishing another release.
EKoR was named as another player with lag, but no report was found under that name;
their launcher version and hardware/performance details remain unverified.

Private evidence is retained under `C:/dr/nyxxie-crash-20261025`, outside the repository.
Do not commit raw dumps, account credentials or full player diagnostics.

## Withdrawal in launcher 1.0.40

Nyxxie's full Escalation completed without a crash with the two HUD mods and the
local diagnostic probe off. This supports containment, but does not prove which
component caused the crash. A later report from Xaichan reads address `0xffffffff`
and starts in DauntlessUnbroken rather than UE4SS; its text stack alone cannot
establish the same cause. Menu use reportedly increases the frequency.

The release manifest now disables DamageMeter and PartMonitor in kept mods.txt
and removes their four scripts from existing game installations. Both default
off and their source is excluded from the installation manifest, so a fresh
installation or in-game toggle cannot restore them. Source remains for tests.
This applies only after updating and fully restarting the game; running clients
cannot be changed remotely. The guarded candidate is not claimed crash-free.

## Unpublished layout candidate

The repair branch adds saved horizontal/vertical offsets and 0–100% background
opacity controls for each overlay. The part list defaults farther left to clear
tonics; viewport bounds constrain movement. Both overlays now require island-hunt
context, excluding Ramsgate, training grounds, loading and unavailable state.
Mock regressions exercise those transitions, movement and transparent backgrounds.
This candidate remains withdrawn and needs native crash/performance and visual
testing before any re-enable; these controls are not part of the 1.0.40 withdrawal.

## Native shop investigation (October 27)

The older October 23 report is a game-thread hang after 5,039 seconds at
`NoPlatinumPrice::KindOf` / `OnProcessEvent`. Disassembly maps its recorded RVA
`b300` to the unordered-map bucket traversal, not `Class->GetName()`. There is
no minidump for that hang, so map corruption or an off-thread writer is not proven.

Code inspection establishes an independent re-entry defect: `Apply` dispatches
widget `ProcessEvent` calls, which return to `OnProcessEvent` and can append/erase
`Seen` before the throttle check while the outer loop holds vector iterators.
The candidate adds a scoped thread-local re-entry guard, rejects null classes,
and invalidates cached kinds/property offsets when the class index/name changes.
Tracked widgets also retain their name to reject address reuse with a new name.
These identity checks are not serial-number-aware weak references and do not
establish general safety for every stale native pointer.

`tests/no-platinum-reentry.cpp` runs the actual helper with a minimal SDK stand-in:
nested widget events cannot mutate the active list, the guard releases afterward,
destroyed/replaced tracked widgets are removed, and class-name reuse clears cached
offsets. The Windows Release x64 DLL also builds successfully. This candidate is
not installed or released; native menu/travel testing remains necessary.

The October 20 local `0xffffffff` report resolves in UE4SS property lookup, and
the October 12 report resolves in the old native `VendorTabs::Show`. Thus the
short error address by itself does not identify a shared crash cause. Neither
local dump can substitute for Xaichan's missing crash dump. The exact Lua script
behind Nyxxie's name-lookup crashes remains unknown because its compact dump
does not contain the relevant Lua heap/object memory.
