#pragma once

#include <string_view>
#include <vector>

namespace MaintenanceAccess1105 {

inline bool ValidId(std::wstring_view id) {
    if (id.empty() || id.size() > 64) return false;
    for (const wchar_t character : id) {
        if (!((character >= L'A' && character <= L'Z') ||
              (character >= L'a' && character <= L'z') ||
              (character >= L'0' && character <= L'9') ||
              character == L'_' || character == L'-')) return false;
    }
    return true;
}

inline bool Allows(std::wstring_view mode, std::wstring_view allowlist, std::wstring_view playerId) {
    if (mode.empty() || mode == L"0") return true;
    if (mode != L"1" || !ValidId(playerId) || allowlist.empty()) return false;

    size_t start = 0;
    bool matched = false;
    std::vector<std::wstring_view> seen;
    while (start <= allowlist.size()) {
        const size_t end = allowlist.find(L',', start);
        const auto item = allowlist.substr(start, end == std::wstring_view::npos ? end : end - start);
        if (!ValidId(item)) return false;
        for (const auto previous : seen) if (previous == item) return false;
        seen.push_back(item);
        if (item == playerId) matched = true;
        start = end == std::wstring_view::npos ? allowlist.size() + 1 : end + 1;
    }
    return matched;
}

}
