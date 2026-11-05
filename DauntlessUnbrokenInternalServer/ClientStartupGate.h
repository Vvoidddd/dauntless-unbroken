#pragma once

namespace ClientStartupGate {

inline bool WorldReady(const void* World) noexcept {
    return World != nullptr;
}

}
