#pragma once
#include <array>
#include <string_view>

namespace PangarProcDamage {
struct Rule { std::string_view Name; int Damage; };
inline constexpr std::array<Rule, 6> Rules{{
    {"Cell.McrollinRank1", 1000}, {"Cell.McrollinRank2", 2000}, {"Cell.McrollinRank3", 3000},
    {"Cell.McrollinSuccessRank1", 1500}, {"Cell.McrollinSuccessRank2", 3000}, {"Cell.McrollinSuccessRank3", 4500}
}};

inline bool MatchesPinnedRow(int expected, int base, int frost, int flat) {
    return base == 0 && ((frost == expected && flat == 0) || (frost == 0 && flat == expected));
}
inline bool FlattenPinnedRow(int expected, int base, int& frost, int& flat) {
    if (!MatchesPinnedRow(expected, base, frost, flat)) return false;
    frost = 0;
    flat = expected;
    return true;
}
}
