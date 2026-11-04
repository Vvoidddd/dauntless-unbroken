#include "startup-hook-gate.h"
#include <cassert>

int main() {
    assert(!StartupHookGate::ShouldInstall(false, false));
    assert(!StartupHookGate::ShouldInstall(false, true));
    assert(StartupHookGate::ShouldInstall(true, false));
    assert(!StartupHookGate::ShouldInstall(true, true));
}
