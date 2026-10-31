// Local port investigation only. No production DLL, account, or endpoint is used.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <cwchar>
#include <string>
#include <map>
#include "MinHook/MinHook.h"
#include "SDK/Engine_classes.hpp"
extern "C" { void JourneyGuard(); void* JourneyContinue = nullptr; void* JourneyFailure = nullptr; }
extern "C" { void WorldListenGuard(); void* WorldListenContinue = nullptr; }

#include "endpoints.generated.h"

static uintptr_t Base;
static bool Server;
static HANDLE Log = INVALID_HANDLE_VALUE;
static void Note(const char* text) {
    if (Log == INVALID_HANDLE_VALUE) return;
    DWORD written;
    WriteFile(Log, text, static_cast<DWORD>(strlen(text)), &written, nullptr);
    FlushFileBuffers(Log);
}
struct FString { wchar_t* Data; int Count; int Capacity; };
static wchar_t ServerKey[65];
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
static bool (*OriginalConfig)(void*, const wchar_t*, const wchar_t*, FString*, FString*);
static bool Config(void* self, const wchar_t* section, const wchar_t* key, FString* out, FString* filename) {
    if (key && out) {
        const auto found = Endpoints.find(key);
        if (found != Endpoints.end()) { SetString(out, found->second); return true; }
        if (section && wcsstr(section, L"Mcp")) {
            if (_wcsicmp(key, L"Protocol") == 0) {
                SetString(out, wcsstr(section, L"Stomp") ? L"ws" : L"http"); return true;
            }
            if (wcsstr(section, L"XMPP")) {
                if (wcscmp(key, L"ServerAddr") == 0) { SetString(out, L"ws://127.0.0.1:62099"); return true; }
                if (wcscmp(key, L"Domain") == 0) { SetString(out, L"localhost"); return true; }
            }
            if (wcscmp(key, L"Domain") == 0 || wcscmp(key, L"RedirectUrl") == 0) {
                SetString(out, L"127.0.0.1:62000"); return true;
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
    return L"Dauntless-Win64-Shipping.exe -server -unattended -nullrhi -nosound -EpicPortal -NoEAC -MULTIHOME=127.0.0.1 -port=62770 -CULTURE=en-US -UserDir=C:/dr/build-1.10.5-20261030/profile/ -SaveToUserDir";
}
static FString* DefaultMap(FString* out) {
    auto result = OriginalMap(out);
    SetString(result, L"/Game/Maps/ramsgate/ramsgate_01_persistent");
    static bool logged = false;
    if (!logged) { Note("default_map=ramsgate\n"); logged = true; }
    return result;
}
static void (*OriginalTick)(void*, float, char);
static void (*OriginalTickFlush)(SDK::UNetDriver*, float);
static void TickFlush(SDK::UNetDriver* driver, float delta) {
    // WindowsClient TickFlush retains dispatch/flush but omits server replication.
    // Use this build's intact Archon graph; do not also run the old manual actor loop.
    auto* graph = driver->ReplicationDriver;
    if (graph && !driver->ServerConnection && driver->ClientConnections.Num() > 0) {
        const auto replicate = (*reinterpret_cast<uintptr_t**>(graph))[0x2f8/8];
        if (replicate == Base+0x1a85e40)
            reinterpret_cast<int(*)(SDK::UReplicationDriver*,float)>(replicate)(graph, delta);
    }
    OriginalTickFlush(driver, delta);
}
extern "C" bool LocalListen(SDK::UWorld* world, SDK::FURL* requested) {
    if (!world || world->GetName() != "ramsgate_01_persistent") return false;
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
            url.Port = 62770;
            url.Host = L"127.0.0.1";
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
static void Tick(void* self, float delta, char render) {
    OriginalTick(self, delta, render);
    static ULONGLONG next = 0;
    if (GetTickCount64() >= next) {
        next = GetTickCount64() + 5000;
        char line[256];
        auto* world = SDK::UWorld::GetWorld();
        auto* driver = world ? world->NetDriver : nullptr;
        sprintf_s(line, "engine_tick world=%p name=%s driver=%p graph=%p clients=%d frame=%u flags=%u/%u\n", world, world ? world->GetName().c_str() : "none", driver,
                  driver ? driver->ReplicationDriver : nullptr, driver ? driver->ClientConnections.Num() : 0,
                  driver ? *reinterpret_cast<unsigned*>(reinterpret_cast<uintptr_t>(driver)+0x418) : 0,
                  *reinterpret_cast<unsigned char*>(Base+0x6af8eda), *reinterpret_cast<unsigned char*>(Base+0x6af8ed9));
        Note(line);
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
static bool ExactBuild(const wchar_t* path) {
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
    constexpr unsigned char expected[] = {0x41,0xc3,0xb9,0xa9,0x29,0x67,0xb3,0xa3,0x5f,0x3b,0xc6,0xb9,0x76,0x13,0xe9,0x3d,0x99,0x01,0xc7,0x70,0x1b,0xd4,0x7e,0x9f,0x09,0xe0,0xc2,0x41,0xc9,0xcf,0x78,0xfd};
    if (good) good = memcmp(digest, expected, sizeof(expected)) == 0;
    if (hash) BCryptDestroyHash(hash);
    if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0);
    CloseHandle(file);
    return good;
}
static bool Hook(uintptr_t offset, void* replacement, void** original) {
    return MH_CreateHook(reinterpret_cast<void*>(Base + offset), replacement, original) == MH_OK;
}
[[noreturn]] static void Fail(const char* text) { Note(text); TerminateProcess(GetCurrentProcess(), 11); __assume(0); }
BOOL WINAPI DllMain(HMODULE module, DWORD reason, LPVOID) {
    if (reason != DLL_PROCESS_ATTACH) return TRUE;
    DisableThreadLibraryCalls(module);
    wchar_t path[32768], enabled[2];
    GetModuleFileNameW(nullptr, path, 32768);
    if (GetEnvironmentVariableW(L"DR_1105_LOCAL_LAB", enabled, 2) != 1 || enabled[0] != L'1' ||
        wcscmp(path, L"C:\\dr\\build-1.10.5-20261030\\game\\Archon\\Binaries\\Win64\\Dauntless-Win64-Shipping.exe") != 0 || !ExactBuild(path)) return FALSE;
    Base = reinterpret_cast<uintptr_t>(GetModuleHandleW(nullptr));
    Server = wcsstr(GetCommandLineW(), L"-server") != nullptr;
    Log = CreateFileW(Server ? L"C:\\dr\\build-1.10.5-20261030\\native-server.log" : L"C:\\dr\\build-1.10.5-20261030\\native-client.log",
                      FILE_APPEND_DATA, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    Note("verified_exact_1.10.5_build\n");
    AddVectoredExceptionHandler(1, Exception);
    if (MH_Initialize() != MH_OK || !Hook(0x2401e10, Config, reinterpret_cast<void**>(&OriginalConfig))) Fail("config_hook_failed\n");
    // OnQueryPlayerJourneyDataComplete dereferences a null response before its null-safe parser.
    const unsigned char journeyBytes[] = {0x48,0x8b,0x0e,0x48,0x8b,0x01,0xff,0x50,0x40};
    if (memcmp(reinterpret_cast<void*>(Base + 0x192a6b8), journeyBytes, sizeof(journeyBytes))) Fail("journey_guard_bytes_mismatch\n");
    JourneyFailure = reinterpret_cast<void*>(Base + 0x192a71a);
    if (!Hook(0x192a6b8, JourneyGuard, &JourneyContinue)) Fail("journey_guard_failed\n");
    if (Server) {
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
            !Hook(0x3d48950, TickFlush, reinterpret_cast<void**>(&OriginalTickFlush)) ||
            !Hook(0x3bc2f20, Tick, reinterpret_cast<void**>(&OriginalTick))) Fail("server_hook_failed\n");
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
