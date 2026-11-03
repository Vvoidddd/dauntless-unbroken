"""Verify the narrowly scoped legacy-client skip against the pinned game EXE."""
from pathlib import Path
import hashlib
import re
import struct
import sys

folder = Path(__file__).resolve().parent
source = (folder / 'bootstrap.cpp').read_text()
exe = Path(sys.argv[1]) if len(sys.argv) > 1 else folder.parents[2] / 'game/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe'
data = exe.read_bytes()
assert hashlib.sha256(data).hexdigest() == '41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd'
pe = struct.unpack_from('<I', data, 0x3c)[0]
count = struct.unpack_from('<H', data, pe + 6)[0]
optional = struct.unpack_from('<H', data, pe + 20)[0]
sections = [struct.unpack_from('<IIII', data, pe+24+optional+40*i+8) for i in range(count)]

def read(rva, length):
    for _, address, size, raw in sections:
        if address <= rva and rva + length <= address + size:
            return data[raw+rva-address:raw+rva-address+length]
    raise AssertionError(hex(rva))

expected = bytes(int(x, 0) for x in re.search(r'eacExpected\[\] = \{([^}]+)\}', source)[1].split(','))
assert read(0x13645e1, 2) == expected == b'\x74\x35'
assert 0x13645e1 + 2 + expected[1] == 0x1364618  # original branch enters EAC setup
# Falling through instead takes the native NoEAC exit (optional logging, then return).
assert read(0x13645ea, 2) == b'\x0f\x82'
assert 0x13645f0 + struct.unpack('<i', read(0x13645ec, 4))[0] == 0x1364eb7
assert read(0x1364ee1, 1) == b'\xc3'
assert read(0x4fcd5c0, 14).decode('utf-16le') == '-NoEAC '
# The only direct call to the factory loader is inside this initialization path.
assert read(0x1364d77, 1) == b'\xe8'
assert 0x1364d7c + struct.unpack('<i', read(0x1364d78, 4))[0] == 0x13671b0
block = source[source.index('    if (!Server) {'):source.index('    if (Server) {\n        RestoreAbilityDispatch();')]
assert 'Base + 0x13645e1' in block and 'memset(eacBranch, 0x90, sizeof(eacExpected))' in block
assert '!ExactBuild(path)' in source  # full-build guard remains in addition to the branch guard
for rva, expected in (
    (0x1fecc60, '48895c2418488974242055574156488d'),
    (0x1f1cb80, '40564881ec60010000488b05d834a704'),
    (0x3bc2f20, '488bc444884018488948085553565741'),
):
    assert read(rva, len(bytes.fromhex(expected))) == bytes.fromhex(expected), hex(rva)
print('PASS: pinned client-only NoEAC exit; server and connection-error paths unchanged')
print('PASS: pinned shop, portrait and world-tick hook entry points')
