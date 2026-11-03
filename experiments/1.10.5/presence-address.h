#pragma once
#include <string>

inline void RepairPresenceAddress(std::wstring& host, int& port, std::wstring& domain,
                                  const std::wstring& savedDomain, const std::wstring& targetHost,
                                  int targetPort) {
    if (domain.empty() && savedDomain.empty()) return;
    if (domain.empty()) domain = savedDomain;
    if (host.empty()) { host = L"ws://" + targetHost; port = targetPort; }
}
