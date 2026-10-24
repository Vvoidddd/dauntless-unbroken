#include "../EscalationSelectionPolicy.h"
#include <cassert>

int main() {
    const std::vector<EscalationOfferedRelic> cards{{1, 2}, {2, 3}};
    EscalationSelectionOffer player, otherPlayer;
    assert(!player.Consume(cards, 1, true));
    player.Publish(cards, true);
    assert(!player.Consume(cards, 9, true)); // Forged card does not spend the valid offer.
    assert(!player.Consume(cards, 1, false)); // Client cannot change the reward-counter flag.
    assert(!player.Consume({{1, 3}, {2, 3}}, 1, true)); // Quality/offer changed.
    assert(player.Consume(cards, 1, true));
    assert(!player.Consume(cards, 1, true)); // Same-card replay.
    assert(!player.Consume(cards, 2, true)); // Another card from the consumed menu.
    assert(!otherPlayer.Consume(cards, 1, true));

    int nativeApplications = 1, roundRewards = 1;
    player.Publish(cards, true); // Same cards in a genuinely new menu are valid.
    if (player.Consume(cards, 1, true)) { ++nativeApplications; ++roundRewards; }
    for (int retry = 0; retry < 100; ++retry)
        if (player.Consume(cards, 1, true)) { ++nativeApplications; ++roundRewards; }
    assert(nativeApplications == 2 && roundRewards == 2);

    player.Publish(cards, false); // A real bonus offer need not advance the round.
    assert(player.Consume(cards, 2, false));
    player.Publish(cards, true); // Simulate native callback publishing before returning.
    assert(player.Consume(cards, 1, true));
    player.Publish({}, true);
    assert(!player.Consume({}, 1, true));
}
