// Native compatibility hooks for the pinned 1.10.5 client and game hosts.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cwchar>
#include <string>
#include <map>
#include <unordered_set>
#include "presence-address.h"
#include "MinHook/MinHook.h"
#include "SDK/Archon_structs.hpp"
#include "SDK/Engine_classes.hpp"
#include "SDK/UMG_classes.hpp"
#include "SDK/w_store_item_bpw_classes.hpp"
#include "SDK/GameplayAbilities_classes.hpp"
#include "SDK/ReplicationGraph_classes.hpp"
#include "SDK/exploration_game_mode_bpc_classes.hpp"
extern "C" { void JourneyGuard(); void* JourneyContinue = nullptr; void* JourneyFailure = nullptr; }
extern "C" { void WorldListenGuard(); void* WorldListenContinue = nullptr; }
extern "C" { void ApexReportGuardEarly(); void* ApexEarlyContinue = nullptr; void ApexReportGuard(); void* ApexReportContinue = nullptr; void* ApexReportNext = nullptr; }

#include "endpoints.generated.h"

static uintptr_t Base;
static bool Server;
static bool Dojo;
static bool CombatProbe;
static std::wstring BindIp = L"127.0.0.1", BackendAuthority = L"127.0.0.1:62000";
static std::wstring PresenceHost = L"127.0.0.1";
static int PresencePort = 62099;
static std::wstring HuntUrl, HuntMapName, ProfileName;

static bool PrivateIp(const wchar_t* value) {
    unsigned a,b,c,d; wchar_t rest;
    return swscanf_s(value, L"%u.%u.%u.%u%c", &a,&b,&c,&d,&rest,1) == 4 && c<=255 && d<=255 &&
        ((a==100 && b>=64 && b<=127) || (a==127 && b==0 && c==0 && d==1));
}
static std::wstring Endpoint(const std::wstring& original) {
    auto text = original;
    const auto pos = text.find(L"127.0.0.1:62000");
    if (!Server && pos != std::wstring::npos) text.replace(pos,15,BackendAuthority);
    return text;
}
static int ServerPort = 63870;
static std::wstring LocalServerCommand;
static HANDLE Log = INVALID_HANDLE_VALUE;
static void Note(const char* text) {
    if (Log == INVALID_HANDLE_VALUE) return;
    DWORD written;
    WriteFile(Log, text, static_cast<DWORD>(strlen(text)), &written, nullptr);
    FlushFileBuffers(Log);
}
static void SetText(SDK::UTextBlock* block, const SDK::FText& value) {
    if (!block) return;
    auto* function = block->Class->GetFunction("TextBlock", "SetText");
    if (!function) return;
    struct { SDK::FText InText; } params{value};
    block->ProcessEvent(function, &params); // Engine copies the borrowed FText.
}
static void (*OriginalSetStoreViewModel)(SDK::UStoreItemWidget*, SDK::UStoreItemViewModel*);
static void SetStoreViewModel(SDK::UStoreItemWidget* widget, SDK::UStoreItemViewModel* model) {
    OriginalSetStoreViewModel(widget, model);
    if (!widget || !model || widget->StoreItemViewModel != model ||
        widget->Class->GetName() != "w_store_item_bpw_C") return;
    const auto currency = SDK::UKismetStringLibrary::Conv_StringToName(L"CURRENCY_NOTES");
    // Exact 1.10.5 offer layout: standard currencies use enum keys at 0x190;
    // the FName map at 0x1e0 contains custom currencies only.
    struct PriceRef { const uint8_t* Object; void* Reference; };
    const auto& prices = *reinterpret_cast<const SDK::TMap<SDK::EOnlineStorePhoenixCurrency, PriceRef>*>(
        reinterpret_cast<const uint8_t*>(&model->StoreItem) + 0x190);
    if (!prices.IsValid() || prices.NumAllocated() > 16) return;
    for (const auto& entry : prices) {
        if (entry.Key() != SDK::EOnlineStorePhoenixCurrency::Rams || !entry.Value().Object) continue;
        const auto* price = entry.Value().Object;
        if (*reinterpret_cast<const int32_t*>(price + 0x98) < 0) continue;
        auto* card = static_cast<SDK::Uw_store_item_bpw_C*>(widget);
        SetText(card->Text_Cost, *reinterpret_cast<const SDK::FText*>(price + 0x80));
        SetText(card->old_price, *reinterpret_cast<const SDK::FText*>(price + 0x60));
        auto* table = model->CurrencyDataTable;
        if (card->PriceIcon && table && table->RowStruct && table->RowStruct->GetName() == "CurrencyTableData" &&
            table->RowMap.IsValid() && table->RowMap.NumAllocated() < 512) {
            for (const auto& row : table->RowMap) {
                if (row.Key() != currency || !row.Value()) continue;
                auto* function = card->PriceIcon->Class->GetFunction("Image", "SetBrushFromSoftTexture");
                if (function) {
                    struct { SDK::TSoftObjectPtr<SDK::UTexture2D> SoftTexture; bool MatchSize; uint8_t Pad[7]; }
                        params{reinterpret_cast<const SDK::FCurrencyTableData*>(row.Value())->Icon, false, {}};
                    static_assert(sizeof(params) == 0x30);
                    card->PriceIcon->ProcessEvent(function, &params);
                }
                break;
            }
        }
    }
}
static void UpdateCellFusionTime() {
    static SDK::UDataTable* table = nullptr;
    static int index = -1;
    static ULONGLONG next = 0;
    const auto now = GetTickCount64();
    if (now < next) return;
    next = now + (table ? 30000 : 2000);
    if (!table || SDK::UObject::GObjects->GetByIndex(index) != table) {
        table = SDK::UObject::FindObject<SDK::UDataTable>("DataTable cell_exchange_table.cell_exchange_table");
        index = table ? table->Index : -1;
    }
    if (!table || !table->RowStruct || table->RowStruct->GetName() != "CellExchangeTableData" ||
        !table->RowMap.IsValid() || table->RowMap.NumAllocated() > 4096) return;
    int changed = 0;
    for (const auto& entry : table->RowMap) {
        if (!entry.Value()) continue;
        auto* row = reinterpret_cast<SDK::FCellExchangeTableData*>(entry.Value());
        static_assert(sizeof(row->TimeRequired) == sizeof(int64_t));
        auto& ticks = *reinterpret_cast<int64_t*>(&row->TimeRequired);
        if (ticks != 36000000000LL) { ticks = 36000000000LL; ++changed; }
    }
    if (changed) Note("middleman_fusion_recipes_one_hour\n");
}
// The alternate portrait mode calls SetText, removing its Blueprint binding.
// Recycled ordinary portraits must refresh text with their new VM too.
static void (*OriginalSetPortraitViewModel)(SDK::UBehemothPortraitWidget*, SDK::UIslandBehemothViewModel*);
static void SetPortraitViewModel(SDK::UBehemothPortraitWidget* widget, SDK::UIslandBehemothViewModel* model) {
    OriginalSetPortraitViewModel(widget, model);
    if (!widget || !model || widget->IslandBehemothViewModel != model || !widget->LevelTextBlock) return;
    auto* text = widget->LevelTextBlock;
    auto* setText = text->Class->GetFunction("TextBlock", "SetText");
    if (!setText) return;
    // Reflected const-reference parameter: let the engine own/copy FText.
    // The native virtual setter instead consumes a by-value owning temporary.
    struct { SDK::FText InText; } params{model->BehemothDisplayName};
    static_assert(sizeof(params) == 0x18);
    text->ProcessEvent(setText, &params);
}
// Both RPC wrappers keep ownership/validation and event lifetime. Native
// activation still checks the ability spec, prediction, cooldown and cost.
static bool (*TryAbility)(SDK::UAbilitySystemComponent*, uint32_t, SDK::FPredictionKey*, SDK::UGameplayAbility**, void*, const SDK::FGameplayEventData*);
static void (*InputPressed)(SDK::UAbilitySystemComponent*, uint32_t);
static void (*InputReleased)(SDK::UAbilitySystemComponent*, uint32_t);
static unsigned AbilityAccepted = 0, AbilityRejected = 0;
static void ActivateAbility(SDK::UAbilitySystemComponent* self, uint32_t handle, bool pressed,
                            const SDK::FPredictionKey* prediction, const SDK::FGameplayEventData* event) {
    if (!self || !prediction) return;
    auto key = *prediction; // Native function takes a 16-byte value indirectly.
    if (pressed) InputPressed(self, handle);
    SDK::UGameplayAbility* instance = nullptr;
    if (TryAbility(self, handle, &key, &instance, nullptr, event)) {
        ++AbilityAccepted;
        return;
    }
    ++AbilityRejected;
    if (pressed) InputReleased(self, handle);
    // Send failure to the owning client to clear its predicted activation.
    // Calling the implementation directly would not send the RPC.
    auto* failed = self->Class->GetFunction("AbilitySystemComponent", "ClientActivateAbilityFailed");
    if (failed) {
        struct { uint32_t Handle; int16_t Key; uint16_t Pad; } params{handle, prediction->Current, 0};
        static_assert(sizeof(params) == 8 && sizeof(SDK::FPredictionKey) == 16);
        self->ProcessEvent(failed, &params);
    }
}
struct FString { wchar_t* Data; int Count; int Capacity; };
static wchar_t ServerKey[65];
static FString* (*OriginalDialogNamespace)(FString*, const FString*, uint8_t);
static FString* DialogNamespace(FString* out, const FString* speaker, uint8_t addressee) {
    // The packaged quest translations have Neutral entries but no Unspecified
    // addressee. Normalize only the display lookup; never change saved appearance.
    return OriginalDialogNamespace(out, speaker, addressee == 4 ? 0 : addressee);
}
static bool (*OriginalProcessRequest)(void*);
static bool ProcessRequest(void* request) {
    // Exact-build FCurlHttpRequest URL. The trailing slash prevents matching a
    // different authority such as 127.0.0.1:62000.example.org. No key leaves the lab.
    const auto& url = *reinterpret_cast<const FString*>(reinterpret_cast<uintptr_t>(request)+0x70);
    constexpr wchar_t prefix[] = L"http://127.0.0.1:62000/";
    constexpr size_t length = (sizeof(prefix)/sizeof(wchar_t))-1;
    if (url.Data && url.Count > length && url.Count <= 16384 && wmemcmp(url.Data, prefix, length) == 0) {
        wchar_t headerText[] = L"x-dauntless-unbroken-gameserver-apikey";
        FString header{headerText, static_cast<int>(sizeof(headerText)/sizeof(wchar_t)), static_cast<int>(sizeof(headerText)/sizeof(wchar_t))};
        FString key{ServerKey, 65, 65};
        reinterpret_cast<void(*)(void*,const FString*,const FString*)>(Base+0x30c7990)(request, &header, &key);
    }
    return OriginalProcessRequest(request);
}
static void SetString(FString* out, const std::wstring& text) {
    auto realloc = reinterpret_cast<void*(*)(void*, size_t, uint32_t)>(Base + 0x23808d0);
    auto data = static_cast<wchar_t*>(realloc(out->Data, (text.size() + 1) * sizeof(wchar_t), 0));
    if (!data) TerminateProcess(GetCurrentProcess(), 10);
    memcpy(data, text.c_str(), (text.size() + 1) * sizeof(wchar_t));
    *out = {data, static_cast<int>(text.size() + 1), static_cast<int>(text.size() + 1)};
}
static uintptr_t (*OriginalPresenceLogin)(void*, void*, void*);
static uintptr_t PresenceLogin(void* self, void* user, void* credential) {
    auto* object = static_cast<unsigned char*>(self);
    auto* host = reinterpret_cast<FString*>(object + 0x60);
    auto* port = reinterpret_cast<int*>(object + 0x70);
    auto* domain = reinterpret_cast<FString*>(object + 0x88);
    const auto* saved = reinterpret_cast<const FString*>(object + 0xf0);
    const bool validSaved = saved->Data && saved->Count > 1 && saved->Count < 256 && saved->Data[saved->Count - 1] == L'\0';
    if ((domain->Count > 1 || validSaved) &&
        host->Count >= 0 && host->Count < 256 && domain->Count >= 0 && domain->Count < 256 &&
        (host->Count <= 1 || (host->Data && host->Data[host->Count - 1] == L'\0')) &&
        (domain->Count <= 1 || (domain->Data && domain->Data[domain->Count - 1] == L'\0'))) {
        std::wstring oldHost = host->Count > 1 ? std::wstring(host->Data, host->Count - 1) : L"";
        std::wstring oldDomain = domain->Count > 1 ? std::wstring(domain->Data, domain->Count - 1) : L"";
        auto newHost = oldHost, newDomain = oldDomain;
        int newPort = *port;
        RepairPresenceAddress(newHost, newPort, newDomain, validSaved ? std::wstring(saved->Data, saved->Count - 1) : L"", PresenceHost, PresencePort);
        if (newDomain != oldDomain) SetString(domain, newDomain);
        if (newHost != oldHost) { SetString(host, newHost); *port = newPort; }
    }
    return OriginalPresenceLogin(self, user, credential);
}
static bool (*OriginalConfig)(void*, const wchar_t*, const wchar_t*, FString*, FString*);
static bool Config(void* self, const wchar_t* section, const wchar_t* key, FString* out, FString* filename) {
    if (key && out) {
        const auto found = Endpoints.find(key);
        if (found != Endpoints.end()) { SetString(out, Endpoint(found->second)); return true; }
        if (section && wcsstr(section, L"Mcp")) {
            if (_wcsicmp(key, L"Protocol") == 0) {
                SetString(out, wcsstr(section, L"Stomp") ? L"ws" : L"http"); return true;
            }
            if (wcsstr(section, L"XMPP")) {
                if (wcscmp(key, L"ServerAddr") == 0) { SetString(out, L"ws://127.0.0.1"); return true; }
                if (wcscmp(key, L"Domain") == 0) { SetString(out, L"localhost"); return true; }
            }
            if (wcscmp(key, L"Domain") == 0 || wcscmp(key, L"RedirectUrl") == 0) {
                SetString(out, BackendAuthority); return true;
            }
        }
    }
    return OriginalConfig(self, section, key, out, filename);
}
static FString* (*OriginalMap)(FString*);
static const wchar_t* (*OriginalCommandLine)();
static int (*OriginalNetMode)(void*);
static int DedicatedNetMode(void*) { return 1; }
static const wchar_t* ServerCommandLine() {
    return LocalServerCommand.c_str();
}
static FString* DefaultMap(FString* out) {
    auto result = OriginalMap(out);
    SetString(result, CombatProbe ? HuntUrl.c_str() : Dojo ? L"/Game/Maps/islands/dojo/training_dojo_persistent?game=/Game/Blueprints/GameMode/BPGM_ArchonTrainingGrounds.BPGM_ArchonTrainingGrounds_C?MaxPlayers=12"
                          : L"/Game/Maps/ramsgate/ramsgate_01_persistent");
    static bool logged = false;
    if (!logged) { Note(Dojo ? "default_map=training_dojo\n" : "default_map=ramsgate\n"); logged = true; }
    return result;
}
static void (*OriginalTick)(void*, float, char);
static void (*OriginalTickFlush)(SDK::UNetDriver*, float);
struct ConnectionActorInfo { void* Channel; float CullDistance; float CullDistanceSquared; };
struct ConnectionActorInfoRef { ConnectionActorInfo* Info; void* Controller; };
using ConnectionActorMap = UC::TMap<SDK::AActor*, ConnectionActorInfoRef>;
static_assert(sizeof(ConnectionActorInfoRef) == 16);
static_assert(offsetof(ConnectionActorInfo, CullDistance) == 8);
static_assert(offsetof(ConnectionActorInfo, CullDistanceSquared) == 12);
static SDK::AActor* PlayerRole(SDK::AArchonCharacter* character) {
    if (!character || !character->Class) return nullptr;
    static const auto roleName = SDK::BasicFilesImplUtils::StringToName(L"PlayerRole");
    for (auto* owner = static_cast<SDK::UStruct*>(character->Class); owner; owner = owner->SuperStruct) {
        for (auto* field = owner->ChildProperties; field; field = field->Next) {
            if (field->Name != roleName) continue;
            auto* property = reinterpret_cast<SDK::FProperty*>(field);
            if (property->ArrayDim != 1 || property->ElementSize != sizeof(void*) ||
                property->Offset < 0 || property->Offset > 0x2000) return nullptr;
            return *reinterpret_cast<SDK::AActor**>(reinterpret_cast<uint8_t*>(character) + property->Offset);
        }
    }
    return nullptr;
}
static void FixEquipmentCull(SDK::UNetDriver* driver, SDK::UReplicationDriver* rawGraph) {
    auto* graph = static_cast<SDK::UReplicationGraph*>(rawGraph);
    if (!graph->Connections.IsValid() || !driver->ClientConnections.IsValid() || graph->Connections.Num() > 64 || driver->ClientConnections.Num() > 64) return;
    std::unordered_set<SDK::AActor*> equipment;
    for (auto* owner : driver->ClientConnections) {
        auto* pawn = owner && owner->PlayerController ? owner->PlayerController->Pawn : nullptr;
        if (!pawn || !pawn->IsA(SDK::AArchonCharacter::StaticClass())) continue;
        auto* character = static_cast<SDK::AArchonCharacter*>(pawn);
        auto* weapon = character->Weapon;
        if (weapon && !weapon->IsActorBeingDestroyed() && weapon->WeaponType == SDK::EWeaponType::WeaponType_IHAMMER && weapon->bAlwaysRelevant) equipment.insert(weapon);
        auto* role = PlayerRole(character);
        if (role && !role->IsActorBeingDestroyed() && role->bNetUseOwnerRelevancy) equipment.insert(role);
    }
    if (equipment.empty()) return;
    for (auto* manager : graph->Connections) {
        if (!manager) continue;
        auto* entries = reinterpret_cast<ConnectionActorMap*>(reinterpret_cast<uint8_t*>(manager) + 0x30);
        if (!entries->IsValid() || entries->NumAllocated() > 100000) continue;
        for (auto& pair : *entries) {
            if (!equipment.contains(pair.Key()) || !pair.Value().Info || !pair.Value().Controller) continue;
            auto* info = pair.Value().Info;
            if (info->CullDistance != 0 || info->CullDistanceSquared != 0) {
                info->CullDistance = 0;
                info->CullDistanceSquared = 0;
                Note("equipment_replication_distance_fixed\n");
            }
        }
    }
}
static void TickFlush(SDK::UNetDriver* driver, float delta) {
    // WindowsClient TickFlush retains dispatch/flush but omits server replication.
    // Use this build's intact Archon graph; do not also run the old manual actor loop.
    auto* graph = driver->ReplicationDriver;
    if (graph && !driver->ServerConnection && driver->ClientConnections.Num() > 0) {
        const auto replicate = (*reinterpret_cast<uintptr_t**>(graph))[0x2f8/8];
        if (replicate == Base+0x1a85e40) {
            FixEquipmentCull(driver, graph);
            reinterpret_cast<int(*)(SDK::UReplicationDriver*,float)>(replicate)(graph, delta);
        }
    }
    OriginalTickFlush(driver, delta);
}
extern "C" bool LocalListen(SDK::UWorld* world, SDK::FURL* requested) {
    if (!world || world->GetName() != (CombatProbe ? std::string(HuntMapName.begin(),HuntMapName.end()) : Dojo ? "training_dojo_persistent" : "ramsgate_01_persistent")) return false;
    const int active = *reinterpret_cast<int*>(reinterpret_cast<uintptr_t>(world)+0x158);
    if (active < 0 || active >= world->LevelCollections.Num() || world->LevelCollections.Num() > 16) return false;
    auto& collection = world->LevelCollections[active];
    // SetActiveLevelCollection restores these pointers on every collection switch.
    // Only the dynamic source collection owns this server's gameplay driver.
    if (collection.Pad_0[0] != 0 || collection.PersistentLevel != world->PersistentLevel) return false;
    auto* engine = SDK::UEngine::GetEngine();
    if (!engine) return false;
    const auto name = SDK::UKismetStringLibrary::Conv_StringToName(L"GameNetDriver");
    using CreateDriver = bool(*)(void*, SDK::UWorld*, SDK::FName, SDK::FName);
    const bool created = reinterpret_cast<CreateDriver>(Base + 0x3ff9060)(engine, world, name, name);
    char line[256]; sprintf_s(line, "driver_created=%d\n", created); Note(line);
    // FWorldContext's current-world pointer is not reflected. Its offset is verified
    // against CreateNamedNetDriver's world overload in this exact executable.
    auto& contexts = *reinterpret_cast<SDK::TArray<SDK::FWorldContext*>*>(reinterpret_cast<uintptr_t>(engine)+0xc38);
    if (contexts.Num() < 1 || contexts.Num() > 16) { Note("driver_invalid_world_contexts\n"); return false; }
    for (auto* context : contexts) {
        if (!context || *reinterpret_cast<SDK::UWorld**>(reinterpret_cast<uintptr_t>(context)+0x280) != world) continue;
        for (const auto& entry : context->ActiveNetDrivers) {
            auto* driver = entry.NetDriver;
            if (!driver || driver->NetDriverName != name) continue;
            const auto table = *reinterpret_cast<uintptr_t**>(driver);
            sprintf_s(line, "driver=%p class=%s vtable=%llx listen=%llx\n", driver, driver->Class->GetName().c_str(), reinterpret_cast<uintptr_t>(table)-Base, table[0x290/8]-Base);
            Note(line);
            // Verified IpNetDriver::InitListen: logs "IpNetDriver listening on port".
            if (table[0x290/8] != Base+0xa4d240) { Note("unexpected_listen_function\n"); return false; }
            auto setWorld = reinterpret_cast<void(*)(SDK::UNetDriver*,SDK::UWorld*)>(Base+0x3d55c60);
            setWorld(driver, world);
            driver->ServerConnection = nullptr;
            SDK::FURL url = *requested;
            url.Port = ServerPort;
            url.Host = SDK::FString(BindIp.c_str());
            SDK::FString error;
            const bool listening = reinterpret_cast<bool(*)(SDK::UNetDriver*,void*,SDK::FURL*,bool,SDK::FString*)>(table[0x290/8])(
                driver, reinterpret_cast<void*>(reinterpret_cast<uintptr_t>(world)+0x28), &url, false, &error);
            sprintf_s(line, "listen=%d port=%d error=%s\n", listening, url.Port, error.ToString().c_str()); Note(line);
            if (listening) {
                collection.NetDriver = driver;
                setWorld(driver, world);
                world->NetDriver = driver;
                sprintf_s(line, "listen_world=%p collection=%d driver=%p\n", world, active, driver); Note(line);
            }
            return listening;
        }
    }
    return false;
}
// Explicit catalog diagnostics run only on the game thread, never in client HUD callbacks.
static void DumpHuntTables() {
    static unsigned attempts = 0;
    static bool mmDone = false, phDone = false;
    wchar_t enabled[2];
    if (GetEnvironmentVariableW(L"DR_1105_DUMP_HUNTS",enabled,2)!=1 || enabled[0]!=L'1' || attempts++>=24) return;
    auto* mm=SDK::UObject::FindObject<SDK::UDataTable>("DataTable matchmaker_hunts_table.matchmaker_hunts_table");
    if (!mmDone && mm && mm->RowStruct && mm->RowStruct->GetName()=="MatchmakerHuntTableData" && mm->RowMap.IsValid() && mm->RowMap.NumAllocated()<4096 && mm->RowMap.Num()>0) {
        Note("DUMP_MM_BEGIN\n");
        for (const auto& pair : mm->RowMap) {
            if (!pair.Value()) continue;
            const auto& row=*reinterpret_cast<const SDK::FMatchmakerHuntTableData*>(pair.Value());
            auto line="DUMP_MM\t"+pair.Key().ToString()+"\t"+row.GameModeOverride.ToString()+"\t"+row.SpecificBehemoth.BehemothAsset.ObjectID.AssetPathName.ToString()+"\t"+std::to_string(row.MaxPlayers)+"\t"+row.GameModeSpecificData.RowName.ToString();
            if (row.MapList.Num()>=0 && row.MapList.Num()<=64)
                for(const auto& map:row.MapList) line+="\t"+map.MapAsset.ObjectID.AssetPathName.ToString();
            Note((line+"\n").c_str());
        }
        Note("DUMP_MM_END\n"); mmDone=true;
    }
    auto* ph=SDK::UObject::FindObject<SDK::UDataTable>("DataTable player_hunts_table.player_hunts_table");
    if (!phDone && ph && ph->RowStruct && ph->RowStruct->GetName()=="PlayerHuntTableData" && ph->RowMap.IsValid() && ph->RowMap.NumAllocated()<4096 && ph->RowMap.Num()>0) {
        Note("DUMP_PH_BEGIN\n");
        for(const auto& pair:ph->RowMap) {
            if(!pair.Value())continue;
            const auto& row=*reinterpret_cast<const SDK::FPlayerHuntTableData*>(pair.Value());
            auto line="DUMP_PH\t"+pair.Key().ToString();
            if(row.MatchmakerHuntIDs.Num()>=0 && row.MatchmakerHuntIDs.Num()<=128)
                for(const auto& id:row.MatchmakerHuntIDs) line+="\t"+id.RowName.ToString();
            Note((line+"\n").c_str());
        }
        Note("DUMP_PH_END\n"); phDone=true;
    }
}
static void InstallApexReportGuard();
static void Tick(void* self, float delta, char render) {
    if (Server) InstallApexReportGuard();
    OriginalTick(self, delta, render);
    UpdateCellFusionTime();
    if (!Server) return; // Client must never run server stamina work or Sleep(25).
    auto* currentWorld = SDK::UWorld::GetWorld();
    auto* currentDriver = currentWorld ? currentWorld->NetDriver : nullptr;
    if (currentDriver && !currentDriver->ServerConnection) {
        for (auto* connection : currentDriver->ClientConnections) {
            auto* pawn = connection && connection->PlayerController ? connection->PlayerController->Pawn : nullptr;
            if (!pawn || pawn->IsActorBeingDestroyed()) continue;
            // WindowsClient omits this authority dispatch. Match the 1.4.4 host:
            // the Blueprint handles regen permission, drain and frame delta.
            auto* tickStamina = pawn->Class->GetFunction("BP_PlayerCharacter_C", "TickStamina");
            if (!tickStamina) continue;
            struct { uint8_t Where, Whom; } params{2,5}; // Both cities/hunts; All peers.
            pawn->ProcessEvent(tickStamina, &params);
        }
    }
    static ULONGLONG next = 0;
    if (GetTickCount64() >= next) {
        next = GetTickCount64() + 5000;
        DumpHuntTables();
        char line[256];
        auto* world = SDK::UWorld::GetWorld();
        auto* driver = world ? world->NetDriver : nullptr;
        sprintf_s(line, "engine_tick world=%p name=%s driver=%p graph=%p clients=%d frame=%u flags=%u/%u\n", world, world ? world->GetName().c_str() : "none", driver,
                  driver ? driver->ReplicationDriver : nullptr, driver ? driver->ClientConnections.Num() : 0,
                  driver ? *reinterpret_cast<unsigned*>(reinterpret_cast<uintptr_t>(driver)+0x418) : 0,
                  *reinterpret_cast<unsigned char*>(Base+0x6af8eda), *reinterpret_cast<unsigned char*>(Base+0x6af8ed9));
        Note(line);
        sprintf_s(line, "ability_dispatch accepted=%u rejected=%u\n", AbilityAccepted, AbilityRejected);
        Note(line);
        if (CombatProbe && world && world->AuthorityGameMode && world->AuthorityGameMode->IsA(SDK::AArchonGameMode_Island::StaticClass())) {
            auto* mode=static_cast<SDK::AArchonGameMode_Island*>(world->AuthorityGameMode);
            auto* component=mode->MainGameModeComponent;
            if (component && component->IsA(SDK::Uexploration_game_mode_bpc_C::StaticClass())) {
                auto* exploration=static_cast<SDK::Uexploration_game_mode_bpc_C*>(component);
                auto* director=reinterpret_cast<SDK::UIslandDirectorComponent*>(exploration->IslandDirectorComponent);
                sprintf_s(line,"hunt_state spec=%d started=%d waiting=%d active=%d target=%d director=%d contents=%d behemoths=%d\n",
                    exploration->ValidIslandSpecExists,exploration->GameHasStarted,exploration->WaitForArrivals,
                    exploration->ActivePrimaryContents,exploration->TargetNumberOfPrimaryContents,
                    director ? director->bHasIslandDirectorBeenInitialized : 0,director ? director->GameModeContents.Num() : 0,mode->SpawnedBehemoths.Num());
                Note(line);
            }
        }
    }
    Sleep(25);
}
static LONG CALLBACK Exception(EXCEPTION_POINTERS* info) {
    if (info->ExceptionRecord->ExceptionCode == EXCEPTION_ACCESS_VIOLATION) {
        char line[160];
        sprintf_s(line, "access_violation rva=%llx address=%llx\n", info->ContextRecord->Rip - Base,
                  info->ExceptionRecord->ExceptionInformation[1]);
        Note(line);
    }
    return EXCEPTION_CONTINUE_SEARCH;
}
static bool FileMatchesSha256(const wchar_t* path, const unsigned char (&expected)[32]) {
    const auto file = CreateFileW(path, GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;
    BCRYPT_ALG_HANDLE algorithm = nullptr;
    BCRYPT_HASH_HANDLE hash = nullptr;
    bool good = BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) == 0;
    if (good) good = BCryptCreateHash(algorithm, &hash, nullptr, 0, nullptr, 0, 0) == 0;
    unsigned char buffer[65536], digest[32]; DWORD length = 0;
    while (good) {
        if (!ReadFile(file, buffer, sizeof(buffer), &length, nullptr)) { good = false; break; }
        if (!length) break;
        good = BCryptHashData(hash, buffer, length, 0) == 0;
    }
    if (good) good = BCryptFinishHash(hash, digest, sizeof(digest), 0) == 0;
    if (good) good = memcmp(digest, expected, sizeof(expected)) == 0;
    if (hash) BCryptDestroyHash(hash);
    if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
    CloseHandle(file);
    return good;
}
static bool ExactBuild(const wchar_t* path) {
    constexpr unsigned char expected[] = {0x41,0xc3,0xb9,0xa9,0x29,0x67,0xb3,0xa3,0x5f,0x3b,0xc6,0xb9,0x76,0x13,0xe9,0x3d,0x99,0x01,0xc7,0x70,0x1b,0xd4,0x7e,0x9f,0x09,0xe0,0xc2,0x41,0xc9,0xcf,0x78,0xfd};
    return FileMatchesSha256(path, expected);
}
// Skip a damage report if its destructible was removed before or during the callback.
static void InstallApexReportGuard() {
    static bool finished = false;
    static ULONGLONG retryAt = 0;
    if (finished || GetTickCount64() < retryAt) return;
    const auto module = GetModuleHandleW(L"Apex_Destructible_x64.dll");
    if (!module) return;
    wchar_t path[32768] = {};
    const auto length = GetModuleFileNameW(module, path, 32768);
    constexpr unsigned char expected[] = {0xcf,0xce,0x06,0x14,0xe4,0x51,0xd3,0x08,0xea,0x15,0xf8,0xdd,0x86,0xd1,0xb2,0x42,0x44,0x34,0x7a,0x8d,0xac,0x36,0x0d,0x9a,0xd9,0x85,0x23,0x0e,0x72,0x98,0x8d,0x2a};
    const auto base = reinterpret_cast<uintptr_t>(module);
    constexpr unsigned char early[] = {0x83,0x7b,0x2c,0x00,0x76,0x16};
    constexpr unsigned char instruction[] = {0x48,0x83,0x7b,0x68,0x00,0x74,0x4d};
    constexpr unsigned char next[] = {0x3b,0xbd,0xd8,0x01,0x00,0x00};
    if (!length || length >= 32768 || !FileMatchesSha256(path, expected) ||
        memcmp(reinterpret_cast<void*>(base + 0x72460), early, sizeof(early)) ||
        memcmp(reinterpret_cast<void*>(base + 0x7247c), instruction, sizeof(instruction)) ||
        memcmp(reinterpret_cast<void*>(base + 0x724df), next, sizeof(next))) {
        Note("apex_report_guard_build_mismatch\n");
        retryAt = GetTickCount64() + 60000;
        return;
    }
    ApexReportNext = reinterpret_cast<void*>(base + 0x724df);
    auto* earlySite = reinterpret_cast<void*>(base + 0x72460);
    auto* site = reinterpret_cast<void*>(base + 0x7247c);
    if (MH_CreateHook(earlySite, ApexReportGuardEarly, &ApexEarlyContinue) != MH_OK) {
        Note("apex_report_guard_create_failed\n");
        retryAt = GetTickCount64() + 10000;
        return;
    }
    if (MH_CreateHook(site, ApexReportGuard, &ApexReportContinue) != MH_OK) {
        MH_RemoveHook(earlySite);
        Note("apex_report_guard_create_failed\n");
        retryAt = GetTickCount64() + 10000;
        return;
    }
    if (MH_QueueEnableHook(earlySite) != MH_OK || MH_QueueEnableHook(site) != MH_OK || MH_ApplyQueued() != MH_OK) {
        MH_RemoveHook(site);
        MH_RemoveHook(earlySite);
        Note("apex_report_guard_enable_failed\n");
        retryAt = GetTickCount64() + 10000;
        return;
    }
    finished = true;
    Note("apex_report_guard_enabled\n");
}
static bool Hook(uintptr_t offset, void* replacement, void** original) {
    return MH_CreateHook(reinterpret_cast<void*>(Base + offset), replacement, original) == MH_OK;
}
[[noreturn]] static void Fail(const char* text) { Note(text); TerminateProcess(GetCurrentProcess(), 11); __assume(0); }
static void RestoreAbilityDispatch() {
    constexpr unsigned char activate[] = {0x4c,0x89,0x4c,0x24,0x20,0x4c,0x89,0x44,0x24,0x18,0x89,0x54,0x24,0x10,0x55,0x53,0x56,0x57,0x41,0x54,0x41,0x56,0x41,0x57,0x48,0x8d,0xac,0x24,0x30,0xff,0xff,0xff};
    constexpr unsigned char input[] = {0x48,0x8b,0x81,0xf8,0x04,0,0,0x4c,0x63,0x81,0,0x05,0,0,0x4d,0x69,0xc8,0xe0,0,0,0,0x4c,0x03,0xc8,0x49,0x3b,0xc1,0x74,0x21,0x0f,0x1f,0};
    constexpr unsigned char stub[] = {0xc2,0,0};
    if (memcmp(reinterpret_cast<void*>(Base+0x15adad0), activate, sizeof(activate)) ||
        memcmp(reinterpret_cast<void*>(Base+0x15c3b40), input, sizeof(input)) ||
        memcmp(reinterpret_cast<void*>(Base+0x15c3b80), input, sizeof(input)) ||
        memcmp(reinterpret_cast<void*>(Base+0x9cfa00), stub, sizeof(stub))) Fail("ability_bytes_mismatch\n");
    TryAbility = reinterpret_cast<decltype(TryAbility)>(Base+0x15adad0);
    InputPressed = reinterpret_cast<decltype(InputPressed)>(Base+0x15c3b40);
    InputReleased = reinterpret_cast<decltype(InputReleased)>(Base+0x15c3b80);
    // Never hook the shared ret stub: unrelated stripped functions also use it.
    for (const uintptr_t table : {uintptr_t(0x5038ba8), uintptr_t(0x50bb2d0)}) {
        auto* slot = reinterpret_cast<void**>(Base+table+0x808);
        if (*slot != reinterpret_cast<void*>(Base+0x9cfa00)) Fail("ability_slot_mismatch\n");
        DWORD protection, ignored;
        if (!VirtualProtect(slot, sizeof(*slot), PAGE_READWRITE, &protection)) Fail("ability_slot_write_failed\n");
        *slot = reinterpret_cast<void*>(ActivateAbility);
        if (!VirtualProtect(slot, sizeof(*slot), protection, &ignored)) Fail("ability_slot_protection_failed\n");
    }
    Note("ability_dispatch_restored\n");
}
BOOL WINAPI DllMain(HMODULE module, DWORD reason, LPVOID) {
    if (reason != DLL_PROCESS_ATTACH) return TRUE;
    DisableThreadLibraryCalls(module);
    wchar_t path[32768], enabled[2];
    GetModuleFileNameW(nullptr, path, 32768);
    if (GetEnvironmentVariableW(L"DR_1105_LOCAL_LAB", enabled, 2) != 1 || enabled[0] != L'1' ||
         !ExactBuild(path)) return FALSE;
    Base = reinterpret_cast<uintptr_t>(GetModuleHandleW(nullptr));
    Server = wcsstr(GetCommandLineW(), L"-server") != nullptr;
    wchar_t world[16] = {};
    const DWORD worldLength = GetEnvironmentVariableW(L"DR_1105_WORLD", world, 16);
    if (Server && (worldLength >= 16 || (worldLength && wcscmp(world, L"ramsgate") && wcscmp(world, L"dojo") && wcscmp(world, L"combat-probe")))) return FALSE;
    Dojo = Server && wcscmp(world, L"dojo") == 0;
    CombatProbe = Server && wcscmp(world, L"combat-probe") == 0;
    ServerPort = CombatProbe ? 63872 : Dojo ? 63871 : 63870;
    if (CombatProbe) {
        wchar_t url[4096]={}, port[8]={};
        const auto size=GetEnvironmentVariableW(L"DR_1105_HUNT_URL",url,4096);
        if (!size || size>=4096 || wcsncmp(url,L"/Game/Maps/islands/",18)) return FALSE;
        HuntUrl=url;
        auto map=HuntUrl.substr(0,HuntUrl.find(L'?'));
        HuntMapName=map.substr(map.find_last_of(L'/')+1);
        GetEnvironmentVariableW(L"DR_1105_HUNT_PORT",port,8);
        ServerPort=_wtoi(port);
        if (ServerPort<63872 || ServerPort>63935) return FALSE;
    }
    ProfileName=CombatProbe ? L"profile-hunt-"+std::to_wstring(ServerPort) : Dojo ? L"profile-dojo" : L"profile";

    wchar_t host[64] = {};
    const DWORD hostLength = GetEnvironmentVariableW(Server ? L"DR_1105_BIND_IP" : L"DR_1105_HOST", host, 64);
    if (hostLength) {
        if (hostLength >= 64 || (!PrivateIp(host) && !(Server && wcscmp(host, L"0.0.0.0") == 0))) return FALSE;
        if (Server) BindIp = host;
        else {
            PresenceHost = host;
            wchar_t port[8]={};
            const DWORD n=GetEnvironmentVariableW(L"DR_1105_PORT",port,8);
            unsigned number=62002;
            if(n){
                if(n>=8)return FALSE;
                number=0;for(DWORD i=0;i<n;++i){if(port[i]<L'0'||port[i]>L'9')return FALSE;number=number*10+(port[i]-L'0');}
                if(!number||number>65535)return FALSE;
            }
            BackendAuthority = std::wstring(host) + L":" + std::to_wstring(number);
        }
    }
    if (!Server) {
        wchar_t chatPort[8] = {};
        const DWORD n = GetEnvironmentVariableW(L"DR_1105_XMPP_PORT", chatPort, 8);
        if (n) {
            if (n >= 8) return FALSE;
            unsigned number = 0;
            for (DWORD i = 0; i < n; ++i) { if (chatPort[i] < L'0' || chatPort[i] > L'9') return FALSE; number = number * 10 + (chatPort[i] - L'0'); }
            if (!number || number > 65535) return FALSE;
            PresencePort = static_cast<int>(number);
        }
    }
    LocalServerCommand = L"Dauntless-Win64-Shipping.exe -server -unattended -nullrhi -nosound -NoAsyncLoadingThread -EpicPortal -NoEAC -MULTIHOME=" + BindIp + L" -port=" + std::to_wstring(ServerPort) +
        L" -CULTURE=en-US -UserDir=C:/dr/build-1.10.5-20261030/" + ProfileName + L"/ -SaveToUserDir";
    wchar_t clientLog[32768] = {};
    const DWORD logLength = GetEnvironmentVariableW(L"DR_1105_LOG", clientLog, 32768);
    const auto serverLog = L"C:/dr/build-1.10.5-20261030/" + (CombatProbe ? L"native-hunt-"+std::to_wstring(ServerPort) : Dojo ? std::wstring(L"native-dojo") : std::wstring(L"native-server")) + L".log";
    Log = CreateFileW(!Server && logLength > 0 && logLength < 32768 ? clientLog : Server ? serverLog.c_str() : L"C:/dr/build-1.10.5-20261030/native-client.log", FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    Note("verified_exact_1.10.5_build\n");
    AddVectoredExceptionHandler(1, Exception);
    if (MH_Initialize() != MH_OK || !Hook(0x2401e10, Config, reinterpret_cast<void**>(&OriginalConfig))) Fail("config_hook_failed\n");
    // OnQueryPlayerJourneyDataComplete dereferences a null response before its null-safe parser.
    const unsigned char journeyBytes[] = {0x48,0x8b,0x0e,0x48,0x8b,0x01,0xff,0x50,0x40};
    if (memcmp(reinterpret_cast<void*>(Base + 0x192a6b8), journeyBytes, sizeof(journeyBytes))) Fail("journey_guard_bytes_mismatch\n");
    JourneyFailure = reinterpret_cast<void*>(Base + 0x192a71a);
    if (!Hook(0x192a6b8, JourneyGuard, &JourneyContinue)) Fail("journey_guard_failed\n");
    // Both quest descriptions and scripted dialogue events share this namespace builder.
    const unsigned char dialogBytes[] = {0x48,0x89,0x5c,0x24,0x08,0x55,0x56,0x57};
    if (memcmp(reinterpret_cast<void*>(Base+0x1369ca0), dialogBytes, sizeof(dialogBytes))) Fail("dialog_bytes_mismatch\n");
    if (!Hook(0x1369ca0, DialogNamespace, reinterpret_cast<void**>(&OriginalDialogNamespace))) Fail("dialog_hook_failed\n");
    const unsigned char tickBytes[] = {0x48,0x8b,0xc4,0x44,0x88,0x40,0x18,0x48,0x89,0x48,0x08,0x55,0x53,0x56,0x57,0x41};
    if (memcmp(reinterpret_cast<void*>(Base+0x3bc2f20), tickBytes, sizeof(tickBytes))) Fail("tick_bytes_mismatch\n");
    if (!Hook(0x3bc2f20, Tick, reinterpret_cast<void**>(&OriginalTick))) Fail("tick_hook_failed\n");
    if (!Server) {
        const unsigned char presenceBytes[] = {0x48,0x89,0x5c,0x24,0x10,0x55,0x56,0x57};
        if (memcmp(reinterpret_cast<void*>(Base + 0x4321700), presenceBytes, sizeof(presenceBytes))) Fail("presence_login_bytes_mismatch\n");
        if (!Hook(0x4321700, PresenceLogin, reinterpret_cast<void**>(&OriginalPresenceLogin))) Fail("presence_login_hook_failed\n");
        // Use the legacy EAC plugin's own -NoEAC return path. Unbroken authenticates
        // through its launcher relay; CreateGameClient cannot initialize here.
        auto* eacBranch = reinterpret_cast<unsigned char*>(Base + 0x13645e1);
        const unsigned char eacExpected[] = {0x74,0x35};
        if (memcmp(eacBranch, eacExpected, sizeof(eacExpected))) Fail("eac_skip_bytes_mismatch\n");
        DWORD protection;
        if (!VirtualProtect(eacBranch, sizeof(eacExpected), PAGE_EXECUTE_READWRITE, &protection)) Fail("eac_skip_write_failed\n");
        memset(eacBranch, 0x90, sizeof(eacExpected));
        DWORD unused;
        if (!VirtualProtect(eacBranch, sizeof(eacExpected), protection, &unused)) Fail("eac_skip_protection_failed\n");
        FlushInstructionCache(GetCurrentProcess(), eacBranch, sizeof(eacExpected));
        Note("legacy_gameclient_init_skipped\n");
        const unsigned char portraitBytes[] = {0x40,0x56,0x48,0x81,0xec,0x60,0x01,0x00,0x00,0x48,0x8b,0x05,0xd8,0x34,0xa7,0x04};
        if (memcmp(reinterpret_cast<void*>(Base+0x1f1cb80), portraitBytes, sizeof(portraitBytes))) Fail("portrait_bytes_mismatch\n");
        if (!Hook(0x1f1cb80, SetPortraitViewModel, reinterpret_cast<void**>(&OriginalSetPortraitViewModel))) Fail("portrait_hook_failed\n");
        const unsigned char storeBytes[] = {0x48,0x89,0x5c,0x24,0x18,0x48,0x89,0x74,0x24,0x20,0x55,0x57,0x41,0x56,0x48,0x8d};
        if (memcmp(reinterpret_cast<void*>(Base+0x1fecc60), storeBytes, sizeof(storeBytes))) Fail("store_price_bytes_mismatch\n");
        if (!Hook(0x1fecc60, SetStoreViewModel, reinterpret_cast<void**>(&OriginalSetStoreViewModel))) Fail("store_price_hook_failed\n");
    }
    if (Server) {
        RestoreAbilityDispatch();
        if (GetEnvironmentVariableW(L"DR_1105_GAMESERVER_KEY", ServerKey, 65) != 64 ||
            wcsspn(ServerKey, L"0123456789abcdef") != 64) Fail("missing_local_server_credential\n");
        const unsigned char processBytes[] = {0x40,0x55,0x53,0x41,0x54,0x41,0x56,0x41,0x57,0x48,0x8d,0x6c,0x24,0xc9,0x48,0x81,0xec,0xd0,0x00,0x00,0x00};
        const unsigned char headerBytes[] = {0x48,0x83,0xec,0x38,0x83,0xb9,0xc4,0x00,0x00,0x00,0x01,0x0f,0x85,0xf6,0x00,0x00,0x00};
        if (memcmp(reinterpret_cast<void*>(Base+0x30c4210), processBytes, sizeof(processBytes)) ||
            memcmp(reinterpret_cast<void*>(Base+0x30c7990), headerBytes, sizeof(headerBytes))) Fail("http_auth_bytes_mismatch\n");
        if (!Hook(0x30c4210, ProcessRequest, reinterpret_cast<void**>(&OriginalProcessRequest))) Fail("http_auth_hook_failed\n");
        // The WindowsClient build compiles UWorld::Listen to a false-return stub.
        const unsigned char listenCall[] = {0xe8,0xd3,0x3d,0x9c,0xfc};
        if (memcmp(reinterpret_cast<void*>(Base+0x400bc38), listenCall, 5)) Fail("listen_call_bytes_mismatch\n");
        void* unusedListenTrampoline = nullptr;
        WorldListenContinue = reinterpret_cast<void*>(Base+0x400bc3d);
        if (!Hook(0x400bc38, WorldListenGuard, &unusedListenTrampoline)) Fail("listen_hook_failed\n");
        if (!Hook(0x23ff650, ServerCommandLine, reinterpret_cast<void**>(&OriginalCommandLine)) ||
            !Hook(0x4063fc0, DedicatedNetMode, reinterpret_cast<void**>(&OriginalNetMode)) ||
            !Hook(0x2cf1100, DefaultMap, reinterpret_cast<void**>(&OriginalMap)) ||
            !Hook(0x3d48950, TickFlush, reinterpret_cast<void**>(&OriginalTickFlush))) Fail("server_hook_failed\n");
        *reinterpret_cast<uint8_t*>(Base + 0x6af8eda) = 1;
        *reinterpret_cast<uint8_t*>(Base + 0x6af8ed9) = 0;
        // Same assignment identified in both builds; force the client flag off for -server.
        constexpr uint8_t expected[] = {0x41,0x22,0xc5,0x88,0x05,0x8f,0xc6,0x11,0x06};
        auto at = reinterpret_cast<uint8_t*>(Base + 0x9dc841);
        if (memcmp(at, expected, sizeof(expected))) Fail("client_flag_bytes_mismatch\n");
        DWORD protection;
        if (!VirtualProtect(at, 9, PAGE_EXECUTE_READWRITE, &protection)) Fail("client_flag_write_failed\n");
        const uint8_t patch[] = {0xc6,0x05,0x91,0xc6,0x11,0x06,0x00,0x90,0x90};
        memcpy(at, patch, 9);
        VirtualProtect(at, 9, protection, &protection);
        FlushInstructionCache(GetCurrentProcess(), at, 9);
        const uint8_t expectedClientInit[] = {0x44,0x88,0x25,0x5b,0x81,0x11,0x06};
        at = reinterpret_cast<uint8_t*>(Base + 0x9e0d77);
        if (memcmp(at, expectedClientInit, 7)) Fail("startup_client_bytes_mismatch\n");
        if (!VirtualProtect(at, 7, PAGE_EXECUTE_READWRITE, &protection)) Fail("startup_client_write_failed\n");
        const uint8_t clientInit[] = {0xc6,0x05,0x5b,0x81,0x11,0x06,0x00};
        memcpy(at, clientInit, 7);
        VirtualProtect(at, 7, protection, &protection);
        FlushInstructionCache(GetCurrentProcess(), at, 7);
        // Client-build startup reinitializes these flags after DllMain.
        // Patch only their literal values, with the full EXE hash already checked.
        for (const auto item : {std::pair<uintptr_t,uint8_t>{0x9e0bc0,0}, {0x9e0d71,1}}) {
            auto byte = reinterpret_cast<uint8_t*>(Base + item.first);
            if (*byte != (item.second ? 0 : 1)) Fail("startup_flag_bytes_mismatch\n");
            if (!VirtualProtect(byte, 1, PAGE_EXECUTE_READWRITE, &protection)) Fail("startup_flag_write_failed\n");
            *byte = item.second;
            VirtualProtect(byte, 1, protection, &protection);
            FlushInstructionCache(GetCurrentProcess(), byte, 1);
        }
    }
    if (MH_EnableHook(MH_ALL_HOOKS) != MH_OK) Fail("enable_hooks_failed\n");
    Note(Server ? "local_server_bootstrap_enabled\n" : "local_client_endpoints_enabled\n");
    return TRUE;
}
