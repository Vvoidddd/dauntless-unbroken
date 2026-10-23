#include "../TonicPurchasePolicy.h"
#include <cassert>
#include <iostream>

int main() {
    using TonicPurchasePolicy::CanIgnoreTutorialGate;
    constexpr auto Quest = "CR19_S5_Q2C2_Bosun_PotionPurchase";
    for (auto Item : {"QI_ATTACK_SPEED_POTION", "QI_DAMAGE_BLOCK_POTION", "QI_DAMAGE_ENRAGEBONUS_POTION",
        "QI_EXPOSE_POTION", "QI_LANTERN_POTION", "QI_LIFESTEAL_AOE_POTION", "QI_STAGGER_POTION", "QI_STAMINA_POTION_00"}) {
        assert(CanIgnoreTutorialGate(Item, Quest, 1, 0));
        assert(CanIgnoreTutorialGate(Item, Quest, 1, 1));
        assert(!CanIgnoreTutorialGate(Item, Quest, 0, 0));
        assert(!CanIgnoreTutorialGate(Item, Quest, 2, 0));
        assert(!CanIgnoreTutorialGate(Item, Quest, 1, 2));
        assert(!CanIgnoreTutorialGate(Item, "CR19_S5_Q2C1_Bosun", 1, 0));
    }
    assert(!CanIgnoreTutorialGate("WP_SW_BEGINNER", Quest, 1, 0));
    assert(!CanIgnoreTutorialGate("QI_UNKNOWN_POTION", Quest, 1, 0));
    assert(!CanIgnoreTutorialGate("QI_ATTACK_SPEED_POTION_DEV", Quest, 1, 0));
    assert(!CanIgnoreTutorialGate("qi_attack_speed_potion", Quest, 1, 0));
    std::cout << "Tonic purchase gate boundaries passed\n";
}
