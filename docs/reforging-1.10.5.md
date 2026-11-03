# Reforging in 1.10.5

The game uses `DELETE /progression/:uid/:track` to reset weapon XP when reforging. We were treating that request as a debug command, so the server charged Aethersparks and recorded prestige but refused the XP reset with HTTP 403.

Game servers can now reset a completed level-20 weapon XP track in 1.10.5. Player requests, incomplete weapons and other progression tracks remain blocked. `PROGRESSION_ALLOW_DELETE` does not need to be enabled.

All seven weapon prestige tracks now have real ranks and award one Aetherheart per reforge, including subsequent reforges. Previously they contained only a rank-zero placeholder with no rewards.

## Checks

- 70 targeted progression tests passed, including all seven weapon resets, repeat requests and access restrictions. The metagame build and experience configuration check passed.
- The shared backend was updated on November 3, 2026; installed file hashes matched the build and QoS returned 200. Running worlds were retained.
- A player with two failed attempts subsequently received two Aetherhearts and confirmed prestige rank 2 through the normal reward flow. A proposed refund stopped on its state check before changing anything, because the rewards had already arrived.
- That player's weapon XP remained unchanged from the failed attempts. A fresh in-game reforge still needs verification of the XP reset, reward and Slayer's Path prerequisite together.

Do not refund old charges solely from the original report. Check current prestige, reward transactions and inventory first: the corrected configuration can deliver previously missing rewards on reconnect.
