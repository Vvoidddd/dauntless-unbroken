#pragma once

namespace StartupHookGate {
inline bool ShouldInstall(bool worldReady, bool installed) {
    return worldReady && !installed;
}

inline bool ObjectRegistryReady(const void* objects) {
    return objects != nullptr;
}
}
