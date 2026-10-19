---
title: Feature integrations
description: "Progression, shop, social and world-lifecycle systems in Unbroken."
lang: en
ref: findings/feature-integrations
---

# Feature integrations

The backend implements the Dauntless 1.4.4 client contract through several cooperating systems. Source history and attribution are recorded in the [legal notices]({{ '/legal.html' | relative_url }}).

| System | Responsibility |
|:--|:--|
| Escalation | Season configuration, validated saves and account-specific progression. |
| Shop | Offers, purchase tokens, balances, grants, rotation and retry protection. |
| Social | Friends, parties, guilds, Slayer Links and chat/presence. |
| Worlds | Allocation, readiness checks, recovery and empty-hunt cleanup. |

## Progression and purchases

Progression is persisted per account. Test-only stub replies are separate from real saves and must not become production account templates.

The server resolves a purchase's offer, checks currency and ownership, applies grants and records the mutation. Displayed client prices are not authoritative. Retries must not grant the same purchase twice.

The Rams shop, Trials vendor and Granny Strega have separate catalogs and unlock requirements.

## Parties and worlds {#social}

The backend owns party and queue state. One party hunt is allocated as one world; chat presence is not proof that a player is connected to that game process.

## Validation

Automated checks cover backend contracts. Real clients are needed to verify UI behavior, combat, travel and long sessions. See [Run a server]({{ '/server.html' | relative_url }}) and the [roadmap]({{ '/roadmap.html' | relative_url }}).
