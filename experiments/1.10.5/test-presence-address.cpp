#include "presence-address.h"
#include <cassert>
#include <string>

int main() {
    std::wstring host, domain, saved = L"localhost";
    int port = 5222;
    RepairPresenceAddress(host, port, domain, saved, L"127.0.0.1", 62099);
    assert(host == L"ws://127.0.0.1" && port == 62099 && domain == saved);
    host = L"ws://existing"; port = 443; domain = L"existing";
    RepairPresenceAddress(host, port, domain, saved, L"127.0.0.1", 61000);
    assert(host == L"ws://existing" && port == 443 && domain == L"existing");
    host.clear(); domain = L"existing"; saved = L"localhost"; port = 5222;
    RepairPresenceAddress(host, port, domain, saved, L"100.64.1.2", 61099);
    assert(host == L"ws://100.64.1.2" && port == 61099 && domain == L"existing");
    host.clear(); domain.clear(); saved.clear(); port = 5222;
    RepairPresenceAddress(host, port, domain, saved, L"127.0.0.1", 61000);
    assert(host.empty() && domain.empty() && port == 5222);
}
