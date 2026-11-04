#pragma once

inline bool ShouldFixEquippedWeaponCull(bool isDestroyed, bool alwaysRelevant) {
    return !isDestroyed && alwaysRelevant;
}
