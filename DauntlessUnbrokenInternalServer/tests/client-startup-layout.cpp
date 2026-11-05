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
    const auto installGuard = text.find("ClientStartupGate::ShouldInstallClientHooks", mainThread);
    const auto installCall = text.find("InitClientHooks();", installGuard);

    assert(mainThread != std::string::npos);
    assert(init != std::string::npos);
    assert(installGuard != std::string::npos);
    assert(installCall != std::string::npos);
    assert(installGuard < init);
    assert(installCall < init);
    assert(text.find("InitClientHooks();", init) == std::string::npos);
}
