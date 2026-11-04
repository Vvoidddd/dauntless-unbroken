#include <windows.h>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include "MinHook/MinHook.h"

extern "C" {
    void ApexReportGuard();
    void ApexReportGuardEarly();
    void* ApexEarlyContinue = nullptr;
    void* ApexReportContinue = nullptr;
    void* ApexReportNext = nullptr;
    unsigned ApexTestCall(void*);
    void ApexTestSite();
    void ApexTestEarlySite();
    void ApexTestNext();
    void* ApexRealEntry = nullptr;
    unsigned ApexRealCall(void*, void*);
    void ApexRealExit();
}

static unsigned callbackCount = 0;
static void RemoveReportDuringCallback(void*, void* report) {
    ++callbackCount;
    *reinterpret_cast<void**>(report) = nullptr;
}

int wmain(int argc, wchar_t** argv) {
    SetErrorMode(SEM_FAILCRITICALERRORS | SEM_NOGPFAULTERRORBOX);
    alignas(8) unsigned char report[0x80] = {}, actor[0x600] = {};
    constexpr unsigned char expected[] = {0x48, 0x83, 0x7b, 0x68, 0x00};
    if (std::memcmp(reinterpret_cast<void*>(ApexTestSite), expected, sizeof(expected))) return 1;
    *reinterpret_cast<void**>(report) = actor;
    if (ApexTestCall(report) != 1 || *reinterpret_cast<std::uint32_t*>(actor + 0x5dc) != 0xffffffff) return 2;
    ApexReportNext = reinterpret_cast<void*>(ApexTestNext);
    if (MH_Initialize() != MH_OK || MH_CreateHook(reinterpret_cast<void*>(ApexTestEarlySite), ApexReportGuardEarly, &ApexEarlyContinue) != MH_OK || MH_CreateHook(reinterpret_cast<void*>(ApexTestSite), ApexReportGuard, &ApexReportContinue) != MH_OK || MH_EnableHook(MH_ALL_HOOKS) != MH_OK) return 3;
    *reinterpret_cast<void**>(report) = nullptr;
    if (ApexTestCall(report) != 1) return 4;
    *reinterpret_cast<void**>(report) = actor;
    *reinterpret_cast<std::uint32_t*>(actor + 0x5dc) = 123;
    if (ApexTestCall(report) != 1 || *reinterpret_cast<std::uint32_t*>(actor + 0x5dc) != 0xffffffff) return 5;
    *reinterpret_cast<void**>(report + 0x68) = actor;
    *reinterpret_cast<std::uint32_t*>(report + 0x2c) = 99;
    if (ApexTestCall(report) != 1 || *reinterpret_cast<std::uint32_t*>(report + 0x2c) != 0) return 6;
    *reinterpret_cast<std::uint32_t*>(report + 0x2c) = 1;
    *reinterpret_cast<std::uint32_t*>(report + 0x28) = 1;
    if (ApexTestCall(report) != 1 || *reinterpret_cast<void**>(report) != nullptr) return 15;
    *reinterpret_cast<std::uint32_t*>(report + 0x28) = 0;
    *reinterpret_cast<std::uint32_t*>(report + 0x2c) = 1;
    if (ApexTestCall(report) != 1 || *reinterpret_cast<std::uint32_t*>(report + 0x2c) != 1) return 16;
    if (MH_Uninitialize() != MH_OK) return 7;
    std::puts("APEX report hook: null, valid and nonempty reports passed");
    if (argc == 1) return 0;
    const bool baseline = argc == 3 && std::wcscmp(argv[1], L"--baseline-null") == 0;
    if (argc != 2 && !baseline) return 8;
    HMODULE module = LoadLibraryExW(argv[baseline ? 2 : 1], nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
    if (!module) { std::printf("Cannot load APEX module: %lu\n", GetLastError()); return 9; }
    auto* base = reinterpret_cast<unsigned char*>(module);
    constexpr unsigned char realEarly[] = {0x83,0x7b,0x2c,0x00,0x76,0x16};
    constexpr unsigned char realSite[] = {0x48,0x83,0x7b,0x68,0x00,0x74,0x4d};
    constexpr unsigned char realNext[] = {0x3b,0xbd,0xd8,0x01,0x00,0x00};
    constexpr unsigned char realExit[] = {0x48,0x8b,0x85,0xe0,0x00,0x00,0x00};
    if (std::memcmp(base+0x72460,realEarly,sizeof(realEarly)) || std::memcmp(base+0x7247c,realSite,sizeof(realSite)) || std::memcmp(base+0x724df,realNext,sizeof(realNext)) || std::memcmp(base+0x724eb,realExit,sizeof(realExit))) return 10;
    alignas(8) unsigned char scene[0x200] = {};
    alignas(8) unsigned char callbackOwner[0x120] = {};
    void* callbackVtable[] = {reinterpret_cast<void*>(RemoveReportDuringCallback)};
    void* callback = callbackVtable;
    *reinterpret_cast<void**>(scene+0xe0) = callbackOwner;
    *reinterpret_cast<void**>(callbackOwner+0xf0) = &callback;
    *reinterpret_cast<std::uint32_t*>(scene+0x1d8) = 1;
    ApexRealEntry = base+0x72460;
    ApexReportNext = base+0x724df;
    void* ignored = nullptr;
    if (MH_Initialize() != MH_OK || MH_CreateHook(base+0x724eb, ApexRealExit, &ignored) != MH_OK || (!baseline && (MH_CreateHook(base+0x72460, ApexReportGuardEarly, &ApexEarlyContinue) != MH_OK || MH_CreateHook(base+0x7247c, ApexReportGuard, &ApexReportContinue) != MH_OK)) || MH_EnableHook(MH_ALL_HOOKS) != MH_OK) return 11;
    *reinterpret_cast<void**>(report) = nullptr;
    *reinterpret_cast<void**>(report+0x68) = nullptr;
    *reinterpret_cast<std::uint32_t*>(report+0x2c) = 0;
    if (ApexRealCall(report,scene) != 1) return 12;
    *reinterpret_cast<void**>(report) = actor;
    *reinterpret_cast<std::uint32_t*>(actor+0x5dc) = 123;
    if (ApexRealCall(report,scene) != 1 || *reinterpret_cast<std::uint32_t*>(actor+0x5dc) != 0xffffffff) return 13;
    *reinterpret_cast<std::uint32_t*>(report+0x2c) = 1;
    if (ApexRealCall(report,scene) != 1 || callbackCount != 1 || *reinterpret_cast<void**>(report) != nullptr) return 17;
    if (ApexRealCall(report,scene) != 1 || callbackCount != 1 || *reinterpret_cast<std::uint32_t*>(report+0x2c) != 1) return 18;
    if (MH_Uninitialize() != MH_OK) return 14;
    FreeLibrary(module);
    std::puts("Real APEX report code: null and valid reports passed");
    return 0;
}
