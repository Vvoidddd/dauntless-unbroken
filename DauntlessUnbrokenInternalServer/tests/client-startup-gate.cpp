#include "../ClientStartupGate.h"

#include <cassert>

int main() {
    assert(!ClientStartupGate::WorldReady(nullptr));
    assert(ClientStartupGate::WorldReady(reinterpret_cast<const void*>(1)));
    assert(!ClientStartupGate::ShouldInstallClientHooks(nullptr, false));
    assert(!ClientStartupGate::ShouldInstallClientHooks(reinterpret_cast<const void*>(1), true));
    assert(ClientStartupGate::ShouldInstallClientHooks(reinterpret_cast<const void*>(1), false));
}
