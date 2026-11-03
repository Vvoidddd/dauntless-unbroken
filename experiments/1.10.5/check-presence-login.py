"""Check the presence hook target against the pinned client executable."""
import hashlib
import struct
import sys
from pathlib import Path

data = Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(data).hexdigest() == '41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd'
pe = struct.unpack_from('<I', data, 0x3c)[0]
count = struct.unpack_from('<H', data, pe + 6)[0]
optional = struct.unpack_from('<H', data, pe + 20)[0]
for i in range(count):
    _, address, size, raw = struct.unpack_from('<IIII', data, pe + 24 + optional + 40 * i + 8)
    if address <= 0x4321700 and 0x4321708 <= address + size:
        assert data[raw + 0x4321700 - address:raw + 0x4321708 - address] == bytes.fromhex('48 89 5c 24 10 55 56 57')
        break
else:
    raise AssertionError('Presence login target not found')
print('PASS: presence login entry matches the pinned 1.10.5 executable')
