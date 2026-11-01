"""Load the locally built SDK dumper into this lab's game process only."""
import ctypes as c
from ctypes import wintypes as w
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
expected = root / 'game/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe'
dll = root / 'Dumper-7/x64/Release/Dumper-7.dll'
if len(sys.argv) != 2 or not expected.is_file() or not dll.is_file():
    raise SystemExit('Usage: inject-dumper.py <local lab game PID>; game and dumper must exist')
k = c.WinDLL('kernel32', use_last_error=True)
def api(name, result, *args):
    fn = getattr(k, name)
    fn.restype, fn.argtypes = result, args
    return fn
open_process = api('OpenProcess', w.HANDLE, w.DWORD, w.BOOL, w.DWORD)
query = api('QueryFullProcessImageNameW', w.BOOL, w.HANDLE, w.DWORD, w.LPWSTR, c.POINTER(w.DWORD))
allocate = api('VirtualAllocEx', c.c_void_p, w.HANDLE, c.c_void_p, c.c_size_t, w.DWORD, w.DWORD)
write = api('WriteProcessMemory', w.BOOL, w.HANDLE, c.c_void_p, c.c_void_p, c.c_size_t, c.POINTER(c.c_size_t))
module = api('GetModuleHandleW', w.HMODULE, w.LPCWSTR)
address = api('GetProcAddress', c.c_void_p, w.HMODULE, c.c_char_p)
thread = api('CreateRemoteThread', w.HANDLE, w.HANDLE, c.c_void_p, c.c_size_t, c.c_void_p, c.c_void_p, w.DWORD, c.c_void_p)
wait = api('WaitForSingleObject', w.DWORD, w.HANDLE, w.DWORD)
exit_code = api('GetExitCodeThread', w.BOOL, w.HANDLE, c.POINTER(w.DWORD))
free = api('VirtualFreeEx', w.BOOL, w.HANDLE, c.c_void_p, c.c_size_t, w.DWORD)
close = api('CloseHandle', w.BOOL, w.HANDLE)
def check(value):
    if not value:
        raise c.WinError(c.get_last_error())
    return value
process = check(open_process(0x043A, False, int(sys.argv[1])))
remote = handle = None
completed = False
try:
    name, size = c.create_unicode_buffer(32768), w.DWORD(32768)
    check(query(process, 0, name, c.byref(size)))
    if Path(name.value).resolve() != expected.resolve():
        raise RuntimeError('Refusing a process outside the isolated 1.10.5 game installation')
    data = c.create_string_buffer((str(dll) + '\0').encode('utf-16-le'))
    remote = check(allocate(process, None, len(data), 0x3000, 0x04))
    written = c.c_size_t()
    check(write(process, remote, data, len(data), c.byref(written)))
    if written.value != len(data):
        raise RuntimeError('Incomplete DLL-path write')
    load = check(address(check(module('kernel32.dll')), b'LoadLibraryW'))
    handle = check(thread(process, None, 0, load, remote, 0, None))
    completed = wait(handle, 30000) == 0
    if not completed:
        raise RuntimeError('DLL load did not complete; remote path retained until process exits')
    code = w.DWORD()
    check(exit_code(handle, c.byref(code)))
    if not code.value:
        raise RuntimeError('LoadLibraryW failed inside the isolated game')
    print('Dumper loaded into isolated 1.10.5 process; inspect sdk-dump.log for results')
finally:
    if handle:
        close(handle)
    if remote and (completed or not handle):
        free(process, remote, 0, 0x8000)
    close(process)
