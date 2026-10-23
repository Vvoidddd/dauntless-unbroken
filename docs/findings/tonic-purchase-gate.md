# Tonic purchase gate

The previous `CanPurchase` workaround could not restore buying when the tutorial quest was absent: it required `MaxCanPurchase > 0`, but the native purchase calculation set that quantity to zero after checking the same quest. Void's read-only save on 2026-10-23 had 999410 Rams and no hard-progression series containing that quest. Other players' `itemrecipe` tonic crafting transactions continued to succeed.

In the 1.4.4 executable, `AArchonInventory::GetQuestRequirementsForItemPurchase` is RVA `0x14e8370`. Its wrapper at `0x1a672a0` passes inventory, output array, item ID and output condition in RCX/RDX/R8/R9. It returns a separate array copied from the catalogue. The purchase calculation calls the requirement checker before native price, balance and maximum-quantity calculations.

`GrannyPurchaseTabs.h` now removes the single `CR19_S5_Q2C2_Bosun_PotionPurchase` requirement only for the eight normal tonic IDs and AllRequired/AnyRequired conditions. Additional requirements, other items, crafting and quest progress remain native. Both client and server install the hook. The old result-forcing `CanPurchase` workaround is removed.

The portable policy test covers 52 cases. Native Release x64 compilation and server artifact checks validate packaging; a real client purchase, insufficient-funds refusal and reconnect persistence still require gameplay verification. Recheck the ABI and addresses before changing the supported game version.
