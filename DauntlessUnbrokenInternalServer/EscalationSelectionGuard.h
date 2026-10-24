#pragma once
#include "EscalationSelectionPolicy.h"
#include "NativeDiagnostics.h"
#include "SDK/Archon_parameters.hpp"
#include <cstring>
#include <map>
#include <mutex>

namespace EscalationSelectionGuard {
inline std::uint64_t NameId(const SDK::FName& name) {
    return (std::uint64_t(static_cast<std::uint32_t>(name.ComparisonIndex)) << 32) | name.Number;
}

inline bool Allow(SDK::UObject* object, SDK::UFunction* function, void* parameters) {
    using namespace SDK;
    if (!function || !(function->FunctionFlags &
        (static_cast<uint32>(EFunctionFlags::NetClient) | static_cast<uint32>(EFunctionFlags::NetServer)))) return true;

    // GetFunction only traverses reflection data; constructing an FName here
    // would call Conv_StringToName through this same ProcessEvent hook.
    static thread_local UFunction* display = nullptr;
    static thread_local UFunction* select = nullptr;
    if (!display || !select) {
        auto* type = UPlayerEscalationComponent::StaticClass();
        if (!type) return true;
        display = type->GetFunction("PlayerEscalationComponent", "ClientDisplayRelicChoiceUI");
        select = type->GetFunction("PlayerEscalationComponent", "ServerSelectRelicOption");
    }
    if (function != display && function != select) return true;
    if (!object || !parameters || !object->IsA(UPlayerEscalationComponent::StaticClass())) return false;

    auto* component = static_cast<UPlayerEscalationComponent*>(object);
    auto* objects = UObject::GObjects.GetTypedPtr();
    if (objects->GetByIndex(object->Index) != object) return false;
    const auto& item = objects->GetDecrytedObjPtr()[object->Index / TUObjectArray::ElementsPerChunk]
        [object->Index % TUObjectArray::ElementsPerChunk];
    // Pinned 1.4.4 weak getter (RVA 0x1F79240) checks FUObjectItem+0x10.
    // Do not use SDK FWeakObjectPtr::Get: it ignores serials and permits reuse.
    static_assert(sizeof(FUObjectItem) == 0x18);
    int32 serial = 0;
    std::memcpy(&serial, reinterpret_cast<const char*>(&item) + 0x10, sizeof(serial));
    if (serial <= 0) return false; // The controller holds this component as a native weak pointer.

    struct Entry {
        int32 serial = 0;
        EscalationSelectionOffer offer;
        bool rejectionLogged = false;
    };
    static std::map<int32, Entry> offers;
    static std::mutex mutex;
    const std::lock_guard lock(mutex);
    auto& entry = offers[object->Index];
    if (entry.serial != serial) entry = Entry{serial, {}, false};

    std::vector<EscalationOfferedRelic> current;
    for (const auto& option : component->RelicOptionsForCurrentRound)
        current.push_back({NameId(option.RelicTypeId), option.Quality});

    if (function == display) {
        const auto& args = *static_cast<Params::PlayerEscalationComponent_ClientDisplayRelicChoiceUI*>(parameters);
        std::vector<EscalationOfferedRelic> published;
        for (const auto& option : args.RelicOptions)
            published.push_back({NameId(option.RelicId), option.Quality});
        entry.offer.Publish(published == current ? std::move(published) : std::vector<EscalationOfferedRelic>{}, args.AdvancesEscalation);
        entry.rejectionLogged = false;
        constexpr char line[] = "escalation_offer_published guard=1\n";
        DR_WriteDiagnostic(line, sizeof(line) - 1);
        return true;
    }

    const auto& args = *static_cast<Params::PlayerEscalationComponent_ServerSelectRelicOption*>(parameters);
    if (entry.offer.Consume(current, NameId(args.InRelicId), args.AdvancesEscalation)) {
        constexpr char line[] = "escalation_selection_accepted guard=1\n";
        DR_WriteDiagnostic(line, sizeof(line) - 1);
        return true;
    }
    if (!entry.rejectionLogged) {
        entry.rejectionLogged = true;
        constexpr char line[] = "escalation_selection_rejected guard=1\n";
        DR_WriteDiagnostic(line, sizeof(line) - 1);
    }
    return false;
}
}
