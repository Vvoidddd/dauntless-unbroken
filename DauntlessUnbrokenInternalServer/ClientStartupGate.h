#pragma once

namespace ClientStartupGate {

inline bool WorldReady(const void* World) noexcept {
    return World != nullptr;
}

inline bool ShouldInstallClientHooks(const void* World, bool HooksInstalled) noexcept {
    return WorldReady(World) && !HooksInstalled;
}

}
