"""Check the native maintenance hook against the pinned 1.10.5 executable."""
import hashlib
import struct
import sys
from pathlib import Path

EXPECTED_SHA256 = '41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd'
POST_LOGIN_RVA = 0x196F330
POST_LOGIN_BYTES = bytes.fromhex('48 89 5c 24 10 48 89 74 24 18 57 48 83 ec 60')


def file_offset(data: bytes, rva: int) -> int:
    pe = struct.unpack_from('<I', data, 0x3C)[0]
    sections = struct.unpack_from('<H', data, pe + 6)[0]
    optional_size = struct.unpack_from('<H', data, pe + 20)[0]
    section_table = pe + 24 + optional_size
    for index in range(sections):
        section = section_table + index * 40
        virtual_size, virtual_address, raw_size, raw_offset = struct.unpack_from('<IIII', data, section + 8)
        if virtual_address <= rva < virtual_address + max(virtual_size, raw_size):
            return raw_offset + rva - virtual_address
    raise AssertionError(f'RVA 0x{rva:x} is outside the PE sections')


path = Path(sys.argv[1])
data = path.read_bytes()
assert hashlib.sha256(data).hexdigest() == EXPECTED_SHA256
offset = file_offset(data, POST_LOGIN_RVA)
assert data[offset:offset + len(POST_LOGIN_BYTES)] == POST_LOGIN_BYTES
print('Pinned 1.10.5 executable hash and native K2_PostLogin target passed.')
