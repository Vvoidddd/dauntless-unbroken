#include <cassert>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>

int main() {
    const auto sourcePath = std::filesystem::path(__FILE__).parent_path().parent_path() / "dllmain.cpp";
    std::ifstream source(sourcePath);
    assert(source);

    const std::string text((std::istreambuf_iterator<char>(source)), std::istreambuf_iterator<char>());
    const auto mainThread = text.find("void MainThread()");
    const auto init = text.find("void Init()");
    const auto clientReturn = text.find("if (!Globals::AmServer)\n        return;", mainThread);
    const auto consoleSetup = text.find("UInputSettings::GetDefaultObj()", mainThread);

    assert(mainThread != std::string::npos);
    assert(init != std::string::npos);
    assert(clientReturn != std::string::npos);
    assert(consoleSetup == std::string::npos);
    assert(text.find("InitClientHooks();", mainThread) == std::string::npos);

    // The 1.10.5 GetKeyInfo detour has caused both the old -1 read and the
    // current null startup crash. It must not be installed during client boot.
    assert(text.find("DualSenseIcons::Install(Globals::BaseAddress)") == std::string::npos);
}
