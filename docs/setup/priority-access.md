---
title: Priority access
description: Configure account-based priority queues and reserved hunt and Ramsgate capacity.
---

# Priority access

Priority access is an operator setting bound to account IDs. It does not grant
administrator permissions, change progression, bypass bans, or let a client
select its own queue position.

Set `SERVER_PRIORITY_ACCOUNTS` to the same comma-separated account IDs in the
metagame and every game allocator's environment. Use IDs from the owner account
list, not display names; renaming an account then preserves its priority.

```ini
SERVER_PRIORITY_ACCOUNTS=UID-account-one,UID-account-two
```

Priority groups go before waiting normal groups for hunts and Ramsgate. Each
class keeps its original FIFO order. A group containing a priority member stays
together, and an allocation already in progress finishes without interruption.
The launcher uses the same server ordering for its queue position display.

On each allocator, optional reserved capacity keeps public requests from using
the last configured hunt slots or seats in its oldest Ramsgate:

```ini
PRIORITY_RESERVED_HUNTS=2
PRIORITY_RESERVED_CITY_SEATS=5
```

Both reservations default to zero. Hunt reservations include pending launches
and leave at least one public slot. Capacity telemetry reports `reserved` and
`publicLimit` when hunt slots are reserved. Ramsgate reservations apply only to
the oldest city; subsequent cities retain their full caps. Whole parties count
against the available seats, including travel reservations.

Priority requests still obey hard player/process caps, CPU and memory guards,
drain mode, port availability and launch pacing. Reserved capacity improves
access but cannot guarantee immediate entry during an outage or resource
exhaustion. Existing players are never evicted for a priority request.

Restart the metagame after changing its setting. Drain or wait for an empty
allocator before restarting it; changing files alone does not update a running
allocator. Remove an ID from all configurations and restart those services to
revoke its priority.
