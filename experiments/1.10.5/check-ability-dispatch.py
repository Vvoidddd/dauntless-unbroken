"""Check exact executable guards and compile the real adapter against fake engine calls."""
from pathlib import Path
import hashlib
import re
import struct
import subprocess
import tempfile

folder = Path(__file__).resolve().parent
source = (folder / 'bootstrap.cpp').read_text()
exe = folder.parents[2] / 'game/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe'
data = exe.read_bytes()
assert hashlib.sha256(data).hexdigest() == '41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd'
pe = struct.unpack_from('<I', data, 0x3c)[0]
count, optional = struct.unpack_from('<H', data, pe+6)[0], struct.unpack_from('<H', data, pe+20)[0]
image_base = struct.unpack_from('<Q', data, pe+24+24)[0]
sections = [struct.unpack_from('<IIII', data, pe+24+optional+40*i+8) for i in range(count)]
def read(rva, length):
    for size, address, raw_size, raw in sections:
        if address <= rva and rva+length <= address+raw_size:
            return data[raw+rva-address:raw+rva-address+length]
    raise AssertionError(hex(rva))
for name, rvas in [('activate', [0x15adad0]), ('input', [0x15c3b40, 0x15c3b80]), ('stub', [0x9cfa00])]:
    text = re.search(r'unsigned char '+name+r'\[\] = \{([^}]+)\}', source)[1]
    expected = bytes(int(x.strip(), 0) for x in text.split(','))
    for rva in rvas:
        assert read(rva, len(expected)) == expected, (name, hex(rva))
for table in [0x5038ba8, 0x50bb2d0]:
    assert struct.unpack('<Q', read(table+0x808, 8))[0] == image_base+0x9cfa00

adapter = source[source.index('static bool (*TryAbility)'):source.index('struct FString {')]
prefix = r'''
#include <cassert>
#include <cstdint>
#include <cstring>
int attempts=0, presses=0, releases=0, failures=0;
bool accepted=true;
uint32_t expectedHandle=123;
namespace SDK {
struct FPredictionKey { void* Connection; int16_t Current, Base; uint32_t Flags; };
struct FGameplayEventData {};
struct UGameplayAbility {};
struct UClass { void* GetFunction(const char* cls, const char* fn) {
 assert(!strcmp(cls,"AbilitySystemComponent") && !strcmp(fn,"ClientActivateAbilityFailed")); return this;
}};
struct UAbilitySystemComponent { UClass* Class; void ProcessEvent(void*, void* params) {
 auto* p=static_cast<unsigned char*>(params);
 assert(*reinterpret_cast<uint32_t*>(p)==expectedHandle);
 assert(*reinterpret_cast<int16_t*>(p+4)==42); ++failures;
}};
}
SDK::UAbilitySystemComponent* expectedSelf;
const SDK::FGameplayEventData* expectedEvent;
const SDK::FPredictionKey* originalKey;
bool Native(SDK::UAbilitySystemComponent* self, uint32_t handle, SDK::FPredictionKey* key,
 SDK::UGameplayAbility** instance, void* delegate, const SDK::FGameplayEventData* event) {
 assert(self==expectedSelf && handle==expectedHandle && event==expectedEvent);
 assert(key!=originalKey && key->Current==42 && instance && !*instance && !delegate);
 key->Current=99; ++attempts; return accepted;
}
void Press(SDK::UAbilitySystemComponent* self, uint32_t handle) { assert(self==expectedSelf && handle==expectedHandle); ++presses; }
void Release(SDK::UAbilitySystemComponent* self, uint32_t handle) { assert(self==expectedSelf && handle==expectedHandle); ++releases; }
'''
suffix = r'''
int main() {
 TryAbility=Native; InputPressed=Press; InputReleased=Release;
 SDK::UClass cls; SDK::UAbilitySystemComponent asc{&cls}; expectedSelf=&asc;
 SDK::FPredictionKey key{}; key.Current=42; originalKey=&key;
 SDK::FGameplayEventData event;
 for (bool withEvent : {false,true}) for (bool pressed : {false,true}) for (bool ok : {false,true}) {
   expectedEvent=withEvent ? &event : nullptr; accepted=ok;
   int a=attempts,p=presses,r=releases,f=failures;
   ActivateAbility(&asc,expectedHandle,pressed,&key,expectedEvent);
   assert(attempts==a+1 && presses==p+int(pressed));
   assert(releases==r+int(pressed&&!ok) && failures==f+int(!ok));
   assert(key.Current==42);
 }
 ActivateAbility(nullptr,123,true,&key,nullptr);
 ActivateAbility(&asc,123,true,nullptr,nullptr);
 assert(attempts==8 && AbilityAccepted==4 && AbilityRejected==4);
}
'''
with tempfile.TemporaryDirectory(prefix='unbroken-ability-check-') as temp:
    temp = Path(temp)
    (temp/'check.cpp').write_text('#include <initializer_list>\n'+prefix+adapter+suffix)
    vc = Path('C:/Program Files (x86)/Microsoft Visual Studio/2022/BuildTools/VC/Auxiliary/Build/vcvars64.bat')
    (temp/'check.cmd').write_text(f'@call "{vc}" >nul\n@cl /nologo /EHsc /std:c++17 check.cpp /Fe:check.exe >build.log 2>&1\n@exit /b %errorlevel%\n')
    build = subprocess.run(['cmd.exe','/c',str(temp/'check.cmd')], cwd=temp, capture_output=True)
    assert build.returncode == 0, (temp/'build.log').read_text()
    subprocess.run([str(temp/'check.exe')], cwd=temp, check=True)
print('Exact-build guards and all 8 activation/failure/input/event combinations passed')
