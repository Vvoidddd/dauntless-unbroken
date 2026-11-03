# Read-only snapshot of connected pawns. Offsets apply only to the verified 365075 binary.
param([Parameter(Mandatory=$true)][int[]]$WorldProcessIds)
$ErrorActionPreference = 'Stop'
$expected = '41c3b9a92967b3a35f3bc6b97613e93d9901c7701bd47e9f09e0c241c9cf78fd'
$verified = @{}
foreach ($worldId in $WorldProcessIds) {
    $path = (Get-Process -Id $worldId).MainModule.FileName
    if (!$verified.ContainsKey($path)) {
        $verified[$path] = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -eq $expected
    }
    if (!$verified[$path]) { throw 'Unsupported world binary; refusing offset reads.' }
}
Add-Type -TypeDefinition @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public class BleedoutSnapshot {
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern bool ReadProcessMemory(IntPtr h, IntPtr address, byte[] bytes, int size, out IntPtr read);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
    IntPtr handle;
    byte[] Read(long address, int size) {
        if (address < 65536 || size < 1 || size > 256) throw new Exception("Invalid read bounds");
        var bytes = new byte[size]; IntPtr read;
        if (!ReadProcessMemory(handle, new IntPtr(address), bytes, size, out read) || read.ToInt64() != size)
            throw new Exception("Object unavailable during snapshot");
        return bytes;
    }
    long Ptr(long address) { return BitConverter.ToInt64(Read(address, 8), 0); }
    int Int(long address) { return BitConverter.ToInt32(Read(address, 4), 0); }
    float Float(long address) { return BitConverter.ToSingle(Read(address, 4), 0); }
    int Byte(long address) { return Read(address, 1)[0]; }
    static int Count(int count, int limit) {
        if (count < 0 || count > limit) throw new Exception("Invalid array count");
        return count;
    }
    public static void Sample(int pid) { new BleedoutSnapshot().Run(pid); }
    void Run(int pid) {
        handle = OpenProcess(0x410, false, pid); // QUERY_INFORMATION | VM_READ only
        if (handle == IntPtr.Zero) throw new Exception("Cannot open world for reading");
        try {
            long basis = Process.GetProcessById(pid).MainModule.BaseAddress.ToInt64();
            long world = Ptr(basis + 113925672), driver = Ptr(world + 0x38);
            if (driver == 0) { Console.WriteLine("pid={0} no driver", pid); return; }
            long connections = Ptr(driver + 0x90);
            int count = Count(Int(driver + 0x98), 64);
            Console.WriteLine("pid={0} clients={1}", pid, count);
            for (int i = 0; i < count; i++) {
                try {
                    long controller = Ptr(Ptr(connections + i * 8) + 0x30);
                    long pawn = Ptr(controller + 0x250);
                    if (pawn == 0) continue;
                    long bleed = Ptr(pawn + 0x878), asc = Ptr(pawn + 0x590);
                    if (bleed == 0 || asc == 0) continue;
                    Console.WriteLine("slot={0} state={1} previous={2} ready={3} noHealthHandle={4} replacements={5}",
                        i, Byte(bleed + 0xb0), Byte(bleed + 0xb1), Byte(bleed + 0x170),
                        Int(bleed + 0x160), Count(Int(bleed + 0x150), 64));
                    // Resolve the exact health attribute class through the UObject name pool.
                    long attributes = Ptr(asc + 0x140);
                    int attrs = Count(Int(asc + 0x148), 64);
                    for (int j = 0; j < attrs; j++) {
                        long attribute = Ptr(attributes + j * 8), type = Ptr(attribute + 0x10);
                        int id = Int(type + 0x18);
                        long entry = Ptr(basis + 112301696 + 16 + 8L * (id >> 16)) + 2L * (id & 65535);
                        int header = BitConverter.ToUInt16(Read(entry, 2), 0), length = header >> 6;
                        if (length != 24 || (header & 1) != 0) continue;
                        if (System.Text.Encoding.UTF8.GetString(Read(entry + 2, length)) != "ArchonHealthAttributeSet") continue;
                        Console.WriteLine("slot={0} hp={1} max={2}", i, Float(attribute + 0x30), Float(attribute + 0x38));
                    }
                } catch (Exception e) { Console.WriteLine("slot={0} skipped: {1}", i, e.Message); }
            }
        } finally { CloseHandle(handle); }
    }
}
'@
Get-Date -Format o
foreach ($worldId in $WorldProcessIds) { [BleedoutSnapshot]::Sample($worldId) }
