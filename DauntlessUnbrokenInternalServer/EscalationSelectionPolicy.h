#pragma once
#include <algorithm>
#include <cstdint>
#include <utility>
#include <vector>

struct EscalationOfferedRelic {
    std::uint64_t id;
    int quality;
    bool operator==(const EscalationOfferedRelic&) const = default;
};

// Each trusted menu publication grants one selection, including non-advancing
// offers. Extra card choices widen the menu; they do not grant extra picks.
struct EscalationSelectionOffer {
    std::vector<EscalationOfferedRelic> options;
    bool advances = false;
    bool available = false;

    void Publish(std::vector<EscalationOfferedRelic> offered, bool advancesEscalation) {
        options = std::move(offered);
        advances = advancesEscalation;
        available = !options.empty();
    }

    bool Consume(const std::vector<EscalationOfferedRelic>& current, std::uint64_t id, bool advance) {
        if (!available || advance != advances || current != options ||
            std::none_of(options.begin(), options.end(), [id](const auto& option) { return option.id == id; }))
            return false;
        // Before native callbacks: a reentrant replay must fail, while a genuine
        // new publication during those callbacks must remain available afterward.
        available = false;
        return true;
    }
};
