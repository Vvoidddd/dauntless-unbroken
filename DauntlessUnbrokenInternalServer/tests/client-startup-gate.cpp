#include "../ClientStartupGate.h"

#include <cassert>

int main() {
    assert(!ClientStartupGate::WorldReady(nullptr));
    assert(ClientStartupGate::WorldReady(reinterpret_cast<const void*>(1)));
}
