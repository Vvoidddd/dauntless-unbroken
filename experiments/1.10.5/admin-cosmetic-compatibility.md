# Legacy administrator cosmetics in 1.10.5

The administrator reward catalogue was generated from 1.4.4. Two entries, `WP_AC_UMBRAL_PAPER_00` and `WP_EB_BLAZE_BUGBEAR_00`, are absent from the matching 1.10.5 weapon cosmetic tables. In 1.10.5 compatibility mode, the reward catalogue hides them and both individual and bulk grants exclude them. Existing inventory entries are preserved. Other legacy entries have not all been verified by this check.

The comparison used build 365075, `Archon_23-WindowsClient.pak`, and the `Gameplay/Backend/Catalogs/Gear_Catalogs/weapon_ac_cosmetic_catalog` and `weapon_eblade_cosmetic_catalog` assets. The extracted `.uasset` and `.uexp` files matched the installed package byte for byte, and their decoded DataTable rows were compared with the 1.4.4 administrator catalogue. This is catalogue evidence; no in-game cosmetic test was performed.
