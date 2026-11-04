#include "../maintenance-access.h"
#include <cassert>

int main() {
    using MaintenanceAccess1105::Allows;
    assert(Allows(L"0", L"", L"any") == true);
    assert(Allows(L"1", L"Nabi,Kuiidou", L"Nabi") == true);
    assert(Allows(L"1", L"Nabi,Kuiidou", L"outsider") == false);
    assert(Allows(L"1", L"Nabi,Nabi", L"Nabi") == false);
    assert(Allows(L"1", L"Nabi,", L"Nabi") == false);
    assert(Allows(L"1", L"Nabi,Kuiidou", L"bad id") == false);
}
