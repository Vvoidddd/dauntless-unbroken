// Minimal engine stand-in: exercise the actual helper through nested widget events.
#include <cassert>
#include <cstdint>
#include <functional>
#include <string>
#include <unordered_map>

namespace SDK {
struct UObject;
struct UClass;
struct UFunction {};
struct FName { std::string Value; std::string ToString() const { return Value; } bool operator==(const FName&) const = default; };
struct FField { FName Name; FField* Next = nullptr; };
struct FProperty : FField { int32_t Offset = 0; };
struct UStruct { UStruct* SuperStruct = nullptr; FField* ChildProperties = nullptr; };
struct UClass : UStruct {
    FName Name;
    int32_t Index = 3;
    std::string GetName() const { return Name.ToString(); }
    UFunction* GetFunction(const char*, const char*) { static UFunction Fn; return &Fn; }
};
struct ObjectArray {
    std::unordered_map<int32_t, UObject*> Objects;
    UObject* GetByIndex(int32_t Index) { return Objects[Index]; }
};
struct UObject {
    static inline ObjectArray* GObjects;
    UClass* Class = nullptr;
    int32_t Index = 0;
    FName Name;
    bool IsDefaultObject() const { return false; }
    bool IsA(UClass* Type) const { return Class == Type; }
    std::function<void()> Dispatch;
    void ProcessEvent(UFunction*, void*) { if (Dispatch) Dispatch(); }
};
enum class ESlateVisibility { Visible, Collapsed };
enum class EHorizontalAlignment { HAlign_Left, HAlign_Center };
struct UWidget : UObject { ESlateVisibility Visibility = ESlateVisibility::Visible; UObject* Slot = nullptr; };
struct UVerticalBoxSlot : UObject {
    EHorizontalAlignment HorizontalAlignment = EHorizontalAlignment::HAlign_Left;
    static UClass* StaticClass() { static UClass Class; return &Class; }
};
struct FText { void* TextData = nullptr; std::string ToString() const { return "-1"; } };
struct UTextBlock : UWidget { FText Text; };
}
#define NO_PLATINUM_PRICE_TEST
#include "../NoPlatinumPrice.h"

struct Tooltip : SDK::UObject { SDK::UTextBlock* Text = nullptr; SDK::UWidget* Icon = nullptr; };

int main() {
    SDK::ObjectArray Objects;
    SDK::UObject::GObjects = &Objects;
    SDK::UClass Class;
    Class.Name.Value = "w_CellItem_tooltip_bpw_C";
    assert(NoPlatinumPrice::KindOf(&Class) == NoPlatinumPrice::EKind::Tooltip);
    Tooltip Original, Nested;
    Original.Class = Nested.Class = &Class;
    Original.Index = 1; Nested.Index = 2;
    Objects.Objects[1] = &Original; Objects.Objects[2] = &Nested;
    SDK::UWidget Icon;
    SDK::UTextBlock Text;
    Icon.Class = Text.Class = &Class;
    Text.Text.TextData = &Text;
    Original.Text = &Text; Original.Icon = &Icon;
    // Populate offsets using real member addresses, avoiding non-standard offsetof on inheritance.
    auto offset = [&](auto* Member) { return static_cast<int32_t>(reinterpret_cast<uint8_t*>(Member) - reinterpret_cast<uint8_t*>(&Original)); };
    NoPlatinumPrice::Offsets[&Class] = {{"Txt_PlatinumCost", offset(&Original.Text)}, {"CurrencyImage", offset(&Original.Icon)}};
    int Calls = 0;
    Icon.Dispatch = [&] { ++Calls; NoPlatinumPrice::OnProcessEvent(&Nested); };
    NoPlatinumPrice::OnProcessEvent(&Original);
    assert(Calls == 1);
    assert(NoPlatinumPrice::Seen.size() == 1); // Nested event cannot mutate the active iteration.
    assert(NoPlatinumPrice::Seen.front().Object == &Original);
    NoPlatinumPrice::OnProcessEvent(&Nested);
    assert(NoPlatinumPrice::Seen.size() == 2); // Guard releases after the outer call.
    assert(NoPlatinumPrice::KindOf(nullptr) == NoPlatinumPrice::EKind::None);
    Objects.Objects[1] = nullptr;
    NoPlatinumPrice::NextCheck = {};
    NoPlatinumPrice::OnProcessEvent(nullptr);
    assert(NoPlatinumPrice::Seen.size() == 1 && NoPlatinumPrice::Seen.front().Object == &Nested);
    Nested.Name.Value = "replacement widget at the same address";
    NoPlatinumPrice::NextCheck = {};
    NoPlatinumPrice::OnProcessEvent(nullptr);
    assert(NoPlatinumPrice::Seen.empty());
    Class.Name.Value = "unrelated_class_C";
    assert(NoPlatinumPrice::KindOf(&Class) == NoPlatinumPrice::EKind::None);
    assert(!NoPlatinumPrice::Offsets.contains(&Class));
    assert(NoPlatinumPrice::OffsetOf(&Class, "CurrencyImage") == -1);
}
