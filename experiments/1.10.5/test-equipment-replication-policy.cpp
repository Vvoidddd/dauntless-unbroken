#include "equipment-replication-policy.h"
#include <cassert>

int main() {
    assert(ShouldFixEquippedWeaponCull(false, true));
    assert(!ShouldFixEquippedWeaponCull(true, true));
    assert(!ShouldFixEquippedWeaponCull(false, false));
}
