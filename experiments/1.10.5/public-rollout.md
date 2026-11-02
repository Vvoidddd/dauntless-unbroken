# Public 1.10.5 launcher

I moved the 1.10.5 client into the normal Dauntless Unbroken launcher, version
1.0.45. It uses the existing app identity, account slots and public update feed.
The old test launcher is no longer the release path. This stays on the `1.10.5`
branch so the archived 1.4.4 code is separate.

The launcher downloads the pinned Epic manifest and checks all 606 files. An
existing 1.4.4 install gets a separate 1.10.5 folder. Players choose whether to
keep the old game or remove its verified game files after the new install passes
a full check. Account backups and saved profiles are protected. The old offline
stack and 1.4.4-only client hooks are not loaded into 1.10.5.

Existing UUK keys import their complete account on first sign-in. Imported test
accounts keep their test progress. Weapon XP starts at zero (the game displays
level 1); equipment, quests and island progression carry over. The source 1.4.4
database must remain available to the restricted read-only exporter until every
account is migrated. Do not pre-copy users and key hashes without their saves:
that bypasses the complete first-login import.

The public address remains `5.83.134.32:443`, using its existing TLS certificate.
Unused public invites are transferred with their remaining-use counts. Used or
revoked invites are not made reusable. Existing players sign in with their UUK;
new players need a valid invite. An IP address alone does not preserve an invite:
the certificate, port and invitation database must agree too.

The intended fleet is EU1 and EU2 for games, with the shared backend on EU2 and
the key bot on UK. EU1 keeps its shared 60% CPU budget. The allocator reserves
travellers' seats, queues at capacity and retires confirmed-empty hunts. Two
warm Ramsgate anchors have 20 seats each; each Training Grounds anchor has 12.
Hunt routing is deterministic so retrying a slow startup cannot launch duplicates.

`set-launcher-policy.cjs 1.0.45` requires that version before sign-in or Play;
`set-launcher-policy.cjs off` removes the floor. Only enable the floor once the
public packages and update feed are available. This is a compatibility gate,
not an authentication credential.

Cutover order: stage and verify both runtimes; back up and stop the old writers;
merge invitation/moderation controls transactionally; start the new backend and
workers; switch the existing gateway and bot tunnel; verify public sign-in,
Ramsgate and hunt travel; publish the packages and enable the version floor.
Keep the stopped source save for migration and rollback. Never run two writable
copies of the shared realm.

The automated launcher, migration and allocation checks pass locally. They do
not certify every NPC or combat system. The reported bounty, shop, hunt-pass,
vendor, stamina and ability issues still need individual gameplay checks.
