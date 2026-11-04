# 1.10.5 cosmetic migration

The 1.4.4 account import can contain cosmetic unlocks in `instancedItems`. Build 365075 reads these unlocks as native stacked cosmetics, so the metagame converts matching records when the inventory is loaded.

The conversion is enabled only when the metagame is loopback-bound and identifies `TARGET_CHANGELIST=365075`. The legacy instance remains in the database as recovery evidence. The response exposes one stacked entry with quantity `1`, and existing equipment, cells and other inventory entries are left unchanged. Repeated inventory reads do not add another copy.

This is a storage-compatibility conversion, not a grant of unowned cosmetics. A record is converted only when its catalogue ID is present in the 1.10.5 item-kind table and is one of the supported cosmetic prefixes. Missing or corrupt inventory data still fails closed.

The regression coverage is in `DauntlessUnbrokenMetagame/test/migration-cosmetics1105.test.ts`. It checks both the isolated realm flag and the public 365075 build selector, including preservation of the raw legacy record.
