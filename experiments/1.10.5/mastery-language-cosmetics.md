# Mastery, language and cosmetic fixes

The hosted realm now serves the 1.10.5 mastery reward table. The previous table had no Combat Merit rewards. The replacement contains 239 reward rows across nine tracks, recovered from `Gameplay/Mastery/mastery_track_table` in the 1.10.5 game files. Existing XP thresholds and confirmed ranks stay unchanged. Run `node experiments/1.10.5/check-mastery.cjs` after compiling the metagame to check the override.

The shared backend was reloaded and returned HTTP 200 from `/QoS`. Running worlds were retained; clients and worlds already holding the old config need to reconnect/reload it. Already-confirmed rewards have not been paid again: that needs a separate receipt audit, not a rank reset.

I repaired 558 owned legacy cosmetic entries across 48 characters using the existing inventory conversion. No unmatched entries remained in the post-repair scan. The original ownership records remain intact. Admin grants now use the native stacked format for these cosmetics too. Players need to reconnect to refresh inventory. Without the missing pink sword's item name, this does not establish that its specific report is resolved.

Launcher 1.0.50 sends the selected game language as both `-culture` and `-epiclocale`. The 1.10.5 path previously omitted the latter. The launch-argument test covers English, German and Portuguese with a German OS default. In-game language still needs confirmation.

Published [Launcher 1.0.50](https://github.com/Vvoidddd/dauntless-unbroken/releases/tag/launcher-v1.0.50) with Windows and Linux packages after CI passed. The `launcher-updates` feed contains the 1.0.50 package and `RELEASES`.

## Still under investigation

- Friends bounty: the native setter exists and the friend API schema matches the 1.10.5 parser. In Hunting Grounds, the game filters the party list through accepted friendship before sending social IDs to the server. Do not replace this with credit for every party member. An actual failing party needs its client/server social cache compared with accepted friendships.
- Disappearing Omnicell: native ability activation already sends `ClientActivateAbilitySucceed`. Adding a second acknowledgement would be wrong. No equipment-clearing hook was found. Capture role actor, charge and HUD visibility during the disappearance before changing equipment or cooldown behavior.
- Lightbound Koshai bubbles: the 1.10.5 `paper_radiant_orbiting_close_projectile` asset already enables pooling, movement replication and always-relevant replication. Its visual component references `radiant_projectile_forward_p`. These defaults do not prove that a pooled projectile or its effect activates on a player's client. Forcing replication flags again is not a verified fix; compare the actor and effect on the host and an affected client during the attack.

The live database check found Nyxxie's `Bounty_Bronze_KillWithFriends` at 2/2 and ThePirahna's silver version at 1. This rules out a universal failure, but does not resolve the reported party. Across 3,494 saved loadout-history rows, no same-index `player_role.instance_id` changed from populated to empty. That check covers saved equipment only, not transient actor or HUD state during combat.

Validation: 23 launcher argument tests, 16 admin reward tests, metagame TypeScript compilation and the nine-track mastery check passed. Full hunt/Escalation completion and the two intermittent reports above are not certified by those checks.
