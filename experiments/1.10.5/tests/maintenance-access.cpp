#include "../maintenance-access.h"

#include <cassert>

int main() {
    using MaintenanceAccess1105::Allows;

    assert(Allows(L"0", L"", L"unrelated"));
    assert(Allows(L"", L"", L"unrelated"));
    assert(Allows(L"1", L"allowed-a,allowed-b", L"allowed-b"));
    assert(!Allows(L"1", L"allowed-a,allowed-b", L"unrelated"));
    assert(!Allows(L"2", L"allowed-a", L"allowed-a"));
    assert(!Allows(L"1", L"", L"allowed-a"));
    assert(!Allows(L"1", L"allowed-a,allowed-a", L"allowed-a"));
    assert(!Allows(L"1", L"allowed-a, bad", L"allowed-a"));
    assert(!Allows(L"1", L"allowed-a,allowed-b", L""));
    return 0;
}
