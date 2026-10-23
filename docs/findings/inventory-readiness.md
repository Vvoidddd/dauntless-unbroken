# Inventory loading readiness

The 1.4.4 `HasFinishedLoadingHook` must preserve a false native result for
`AArchonInventory` and its Blueprint subclasses. Other loading-interface objects
retain the existing bypass. The check uses the generated SDK's `IsA` hierarchy,
not a hard-coded Blueprint class name or an address from another game version.

The executable's RVA `0x1528000` resolves `ArchonLoadingInterface` (its class
constructor is at `0x1a76e70`) and calls `HasFinishedLoading`. The old hook
discarded every false result. `SDK/Archon_classes.hpp` defines both the interface
and `AArchonInventory`; inventory loading is asynchronous through
`UArchonInventoryDataLoader::OnQueryPlayerInventoryComplete`.

This closes a premature-readiness path; it does not prove the cause of every
appearance or quest report. One retained save timeline showed an established
feminine appearance replaced by an empty-morph masculine default at a higher
version, while all quest-series statuses and counters remained nondecreasing.
An in-game slow-loading login test is still required to verify that case.

The backend also preserves an existing initialized appearance when a save contains
the exact observed uninitialized default, or omits/cannot decode appearance. It
stores the rest of the save normally and records `:appearance-preserved` in its
history reason. Retry comparison uses the same normalization. Legitimate editor
changes, including masculine characters, remain valid. This protection cannot
repair native memory or identify every later save from an older client, so the
native patch must ship to players as well as servers.

`FindCharacterEndpoint` is unrelated to loading this saved blob: its 1.4.4 request
builder at RVA `0xad7610` makes `GET /character/{characterid}`, but the completion
callback at RVA `0xaf0430` reads only top-level `id` and `name`.

Revalidate the native addresses and SDK hierarchy when changing the game build.
