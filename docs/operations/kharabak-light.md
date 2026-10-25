# Kharabak glare investigation

The recurring bright, sometimes stationary effect is not yet attributed to a
specific runtime particle or light. Do not describe a general lighting reduction
or an aether-timer clamp as a confirmed fix.

Cooked-data checks found:

- The aether poll uses an unbounded FMax value, but writes `AetherSwitch`.
  The21checked Kharabak materials use `Aether Switch` instead. That mismatch
  makes this an unconfirmed candidate, not evidence of the visible glare.
- Swarmzone has a20second lifespan and explicit particle/audio expiry.
- Projectile pooling can deactivate child components. Missing an explicit
  cleanup call for an additional particle component alone does not prove a leak.
- The allocator exposes world metadata, not the client's rendered particle
  state. Dedicated-server particle counts cannot establish the client's glare.

A temporary read-only probe was installed locally for the next affected hunt.
It runs through the existing FrameTick game-thread dispatcher, records nearby
particle templates, owners, positions, activity, visibility and counts, plus
point-light intensity units, radius and falloff. It changes no actors, materials
or brightness. Sampling is bounded to16records per pass and4096per world.

Next evidence needed: a sample while the bright effect is visible. Include nearby
player/lantern effects too, not only Behemoth-owned particles. Particle lights may
not have PointLightComponents. Owner object age is not pool-lease age; compare
observed active transitions and stationary positions across samples.

The local script is diagnostic only, not part of the public client-mod bundle
and not a shipped glare fix. Its log is the game's `ue4ss/UE4SS.log`.
