#pragma once
#include "SDK.hpp"
#include "TonicPurchasePolicy.h"
#include <chrono>
#include <cstddef>

// Enable vendor purchasing; prices, balances and crafting requirements remain native.
namespace GrannyPurchaseTabs {
inline void* OriginalFeatureCheck = nullptr;
using QuestRequirements = SDK::TArray<SDK::FQuestRequirement>;
using PurchaseRequirementsFn = QuestRequirements* (*)(const SDK::AArchonInventory*, QuestRequirements*, const SDK::FString*, SDK::EQuestRequirementCondition*);
inline PurchaseRequirementsFn OriginalPurchaseRequirements = nullptr;
static_assert(sizeof(QuestRequirements) == 16 && sizeof(SDK::FQuestRequirement) == 12);
static_assert(offsetof(SDK::FQuestRequirement, QuestStatusRequired) == 8);
static_assert(static_cast<int>(SDK::EQuestRequirementCondition::AllRequired) == 0
    && static_cast<int>(SDK::EQuestRequirementCondition::AnyRequired) == 1);

inline QuestRequirements* PurchaseRequirements(const SDK::AArchonInventory* Inventory, QuestRequirements* Out,
    const SDK::FString* ItemId, SDK::EQuestRequirementCondition* Condition) {
    auto* Result = OriginalPurchaseRequirements(Inventory, Out, ItemId, Condition);
    // 1.4.4 returns a private copy. Filter only the tonic purchase tutorial gate,
    // leaving quest progression, crafting, other items and additional gates intact.
    if (Result && Result->Num() == 1 && ItemId && Condition
        && TonicPurchasePolicy::CanIgnoreTutorialGate(ItemId->ToString(), (*Result)[0].QuestName.ToString(),
            Result->Num(), static_cast<int>(*Condition))) Result->Remove(0);
    return Result;
}
inline bool FeatureCheck(const SDK::UObject* Context, SDK::UClass* Feature) {
    if (Feature && Feature == SDK::UPurchasesAtVendorFeature::StaticClass()) return true;
    return reinterpret_cast<bool(*)(const SDK::UObject*, SDK::UClass*)>(OriginalFeatureCheck)(Context, Feature);
}
inline void Install(uintptr_t Base) {
    auto* Target = reinterpret_cast<void*>(Base + 0x14B0F70);
    if (MH_CreateHook(Target, FeatureCheck, &OriginalFeatureCheck) == MH_OK)
        MH_EnableHook(Target);
    // Native GetQuestRequirementsForItemPurchase: RCX=this, RDX=return array,
    // R8=item id, R9=condition. Installed for both clients and game servers.
    auto* PurchaseTarget = reinterpret_cast<void*>(Base + 0x14E8370);
    if (MH_CreateHook(PurchaseTarget, PurchaseRequirements, reinterpret_cast<void**>(&OriginalPurchaseRequirements)) == MH_OK)
        MH_EnableHook(PurchaseTarget);
}
inline void Observe(SDK::UObject* Object) {
    static SDK::UCraftingScreen* Screen = nullptr;
    static int32_t Index = -1;
    static std::chrono::steady_clock::time_point NextCheck{};
    if (Object && !Object->IsDefaultObject() && Object->IsA(SDK::UCraftingScreen::StaticClass())) {
        Screen = static_cast<SDK::UCraftingScreen*>(Object);
        Index = Object->Index;
    }
    const auto Now = std::chrono::steady_clock::now();
    if (!Screen || Now < NextCheck) return;
    NextCheck = Now + std::chrono::milliseconds(200);
    if (SDK::UObject::GObjects->GetByIndex(Index) != Screen) { Screen = nullptr; return; }
    if (!Screen->CraftingViewModel || !Screen->CraftingListWidget
        || Screen->CraftingViewModel->EquipmentVendorType != SDK::EEquipmentVendorType::Potions
        || !Screen->ChargeButtonTabs || Screen->ChargeButtonTabs->CachedVisibleTabsCount != 2
        || !Screen->PurchaseTabButton || !Screen->PurchaseTabButton->DataModel
        || !Screen->PurchaseTabButton->SelectedImage) return;
    auto* Container = Screen->ChargeButtonTabsContainer;
    if (!Container || Container->Visibility == SDK::ESlateVisibility::SelfHitTestInvisible) return;
    auto* Function = Container->Class->GetFunction("Widget", "SetVisibility");
    if (!Function) return;
    struct { SDK::ESlateVisibility Value; } Params{SDK::ESlateVisibility::SelfHitTestInvisible};
    Container->ProcessEvent(Function, &Params);
}
}
