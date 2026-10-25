#include "../PangarProcDamagePolicy.h"
#include <cassert>

int main() {
    using namespace PangarProcDamage;
    static_assert(Rules.size() == 6);
    for (const auto& rule : Rules) {
        assert(rule.Damage > 0);
        assert(MatchesPinnedRow(rule.Damage, 0, rule.Damage, 0));
        assert(MatchesPinnedRow(rule.Damage, 0, 0, rule.Damage)); // idempotent recheck
        assert(!MatchesPinnedRow(rule.Damage, 1, rule.Damage, 0));
        assert(!MatchesPinnedRow(rule.Damage, 0, rule.Damage + 1, 0));
        assert(!MatchesPinnedRow(rule.Damage, 0, rule.Damage, rule.Damage));
        assert(!MatchesPinnedRow(rule.Damage, 0, 0, 0));
        int frost = rule.Damage, flat = 0;
        assert(FlattenPinnedRow(rule.Damage, 0, frost, flat));
        assert(frost == 0 && flat == rule.Damage);
        assert(FlattenPinnedRow(rule.Damage, 0, frost, flat));
        assert(frost == 0 && flat == rule.Damage);
        frost = rule.Damage + 1;
        assert(!FlattenPinnedRow(rule.Damage, 0, frost, flat));
        assert(frost == rule.Damage + 1 && flat == rule.Damage);
        for (const auto& other : Rules) if (&other != &rule) assert(other.Name != rule.Name);
        assert(rule.Name != "Lantern.FrostPylon" && rule.Name != "Cell.McrollinRank4");
    }
    assert(Rules[2].Damage == 3000 && Rules[5].Damage == 4500);
}
