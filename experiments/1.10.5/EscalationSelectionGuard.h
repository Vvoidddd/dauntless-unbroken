#pragma once

#include "../../DauntlessUnbrokenInternalServer/EscalationSelectionPolicy.h"
#include "SDK/Archon_parameters.hpp"
#include <cstring>
#include <map>
#include <mutex>

namespace EscalationSelectionGuard1105 {
using NoteFunction = void (*)(const char*);

inline std::uint64_t NameId(const SDK::FName& name) {
    return (std::uint64_t(static_cast<std::uint32_t>(name.ComparisonIndex)) << 32) | name.Number;
}

inline bool Allow(SDK::UObject* object, SDK::UFunction* function, void* parameters, NoteFunction note) {
    using namespace SDK;
    if (!function || !(static_cast<uint32>(function->FunctionFlags) &
        (static_cast<uint32>(EFunctionFlags::NetClient) | static_cast<uint32>(EFunctionFlags::NetServer)))) return true;

    static_assert(sizeof(UPlayerEscalationComponent) == 0x2E0);
    static_assert(offsetof(UPlayerEscalationComponent, RelicOptionsForCurrentRound) == 0x140);
    static_assert(sizeof(FUObjectItem) == 0x18);

    // These lookups only walk reflection data. Constructing an FName here
    // would call back through the ProcessEvent hook.
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
    if (!objects || object->Index < 0 || objects->GetByIndex(object->Index) != object) return false;
    const auto& item = objects->GetDecrytedObjPtr()[object->Index / TUObjectArray::ElementsPerChunk]
        [object->Index % TUObjectArray::ElementsPerChunk];
    // FUObjectItem+0x10 is the serial checked by the engine's weak getter.
    int32 serial = 0;
    std::memcpy(&serial, reinterpret_cast<const char*>(&item) + 0x10, sizeof(serial));
    if (serial <= 0) return false;

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
        entry.offer.Publish(published == current ? std::move(published) : std::vector<EscalationOfferedRelic>{},
                            args.AdvancesEscalation);
        entry.rejectionLogged = false;
        if (note) note("escalation_offer_published guard=1105\n");
        return true;
    }

    const auto& args = *static_cast<Params::PlayerEscalationComponent_ServerSelectRelicOption*>(parameters);
    if (entry.offer.Consume(current, NameId(args.InRelicId), args.AdvancesEscalation)) {
        if (note) note("escalation_selection_accepted guard=1105\n");
        return true;
    }
    if (!entry.rejectionLogged) {
        entry.rejectionLogged = true;
        if (note) note("escalation_selection_rejected guard=1105\n");
    }
    return false;
}
}
