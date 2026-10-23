#pragma once
#include <string_view>

namespace TonicPurchasePolicy {
inline bool CanIgnoreTutorialGate(std::string_view ItemId, std::string_view QuestId, int Count, int Condition) {
    if (Count != 1 || (Condition != 0 && Condition != 1)
        || QuestId != "CR19_S5_Q2C2_Bosun_PotionPurchase") return false;
    return ItemId == "QI_ATTACK_SPEED_POTION"
        || ItemId == "QI_DAMAGE_BLOCK_POTION"
        || ItemId == "QI_DAMAGE_ENRAGEBONUS_POTION"
        || ItemId == "QI_EXPOSE_POTION"
        || ItemId == "QI_LANTERN_POTION"
        || ItemId == "QI_LIFESTEAL_AOE_POTION"
        || ItemId == "QI_STAGGER_POTION"
        || ItemId == "QI_STAMINA_POTION_00";
}
}
