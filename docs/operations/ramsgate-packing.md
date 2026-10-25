# Ramsgate packing and retirement

New CITY admissions use the oldest usable city with room for the complete party,
including unexpired travel reservations. Use `RAMSGATE_POOL=1`,
`RAMSGATE_CITY_CAPS=20,20,20` and `PRIORITY_RESERVED_CITY_SEATS=0` to fill all
20 seats before starting another city. Occupied cities drain naturally; players
are not forcibly transferred.

The allocator watchdog retires cities with fresh native zero occupancy and no
outstanding reservations. Retiring sessions are excluded from cached CITY
destinations. After 190 seconds of confirmed empty observations, the allocator
rechecks occupancy and stops only its matching owned child. Unknown occupancy
resets the grace; an arriving connection cancels retirement. If no active city
fits a new party, a confirmed-empty retiring city reopens immediately rather than
blocking admissions or starting a needless replacement.

CITY candidates expire after their original 180-second travel lease, so a later
return obtains a newly packed destination. Hunt candidate reuse is unchanged.
The 190-second retirement grace covers the 180-second travel window plus the
backend's five-second health cache and three-second health request deadline.

Restarting the deploy service stops all its owned worlds. Do not restart it on
an occupied host merely to apply this change. A live activation must preserve
the existing CityPool queue/reservations and SpawnedChildren map, initialize the
new retirement map, update the scheduled watchdog and status description, and
provide rollback. Replacing whole modules would lose those ownership records.

Checks: allocator suite (121 tests) and backend suite (900 tests), including
concurrent packing, whole-party reservations, retirement/reopen, stale telemetry,
final occupancy/PID revalidation, cached endpoint refusal, restored party CITY
identity, and normal hunt reuse.
