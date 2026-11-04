"""Compile and exercise the runtime PlayerRole property lookup."""
from pathlib import Path
import subprocess
import tempfile

folder = Path(__file__).resolve().parent
source = (folder / 'bootstrap.cpp').read_text()
start = source.index('static SDK::AActor* PlayerRole')
helper = source[start:source.index('static void FixEquipmentCull', start)]
assert 'character->PlayerRole' not in source

prefix = r'''
#include <cassert>
#include <cstdint>
namespace SDK {
struct FName { int Value; bool operator!=(const FName& other) const { return Value != other.Value; } };
struct FField { FName Name; FField* Next; };
struct FProperty : FField { int ArrayDim; int ElementSize; int Offset; };
struct UStruct { FField* ChildProperties; UStruct* SuperStruct; };
struct UClass : UStruct {};
struct AActor {};
struct AArchonCharacter { UClass* Class; AActor* Role; };
namespace BasicFilesImplUtils { FName StringToName(const wchar_t*) { return {7}; } }
}
'''
suffix = r'''
int main() {
    SDK::UClass cls{};
    SDK::FProperty roleProperty{{{7}, nullptr}, 1, sizeof(void*), int(sizeof(void*))};
    cls.ChildProperties = &roleProperty;
    SDK::AActor role;
    SDK::AArchonCharacter character{&cls, &role};
    assert(PlayerRole(&character) == &role);

    SDK::FProperty invalid = roleProperty;
    invalid.ElementSize = 4;
    cls.ChildProperties = &invalid;
    assert(PlayerRole(&character) == nullptr);

    cls.ChildProperties = nullptr;
    assert(PlayerRole(&character) == nullptr);
}
'''

with tempfile.TemporaryDirectory(prefix='unbroken-omnicell-check-') as temp:
    temp = Path(temp)
    (temp / 'check.cpp').write_text(prefix + helper + suffix)
    vcvars = Path('C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat')
    command = temp / 'check.cmd'
    command.write_text(f'@call "{vcvars}" >nul\n@cl /nologo /EHsc /std:c++17 check.cpp /Fe:check.exe >build.log 2>&1\n@exit /b %errorlevel%\n')
    build = subprocess.run(['cmd.exe', '/c', str(command)], cwd=temp, capture_output=True)
    assert build.returncode == 0, (temp / 'build.log').read_text()
    subprocess.run([str(temp / 'check.exe')], cwd=temp, check=True)

print('PlayerRole lookup compiled and passed found, invalid-layout and missing-property cases')
