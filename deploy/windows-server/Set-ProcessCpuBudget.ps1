# Dot-source before launching the deploy server. Its game processes inherit this
# Windows job, sharing ONE CPU budget across all worlds rather than per process.
[CmdletBinding()]
param([ValidateRange(1,100)][int]$Percent = 50,[string]$Name = 'DauntlessGermanyCPU',[switch]$VerifyOnly,
    [ValidateRange(1,2147483647)][int[]]$ProcessIds)
$ErrorActionPreference='Stop'
if (-not ('DauntlessCpuBudget' -as [type])) {
Add-Type @'
using System;
using System.ComponentModel;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class DauntlessCpuBudget {
    [StructLayout(LayoutKind.Sequential)] public struct Rate { public uint Flags; public uint Value; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr OpenJobObject(uint access,bool inherit,string name);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref Rate info,uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr job,int type,out Rate info,uint size,IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool member);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool DuplicateHandle(IntPtr source,IntPtr handle,IntPtr target,out IntPtr copy,uint access,bool inherit,uint options);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    static IntPtr retainedJob;
    static string retainedName;
    public static int[] Apply(string name,uint percent,bool verifyOnly,int[] processIds) {
        if(!verifyOnly && (retainedJob==IntPtr.Zero || retainedName!=name)) {
            IntPtr next=CreateJobObject(IntPtr.Zero,name);
            if(next==IntPtr.Zero)throw new Win32Exception();
            if(retainedJob!=IntPtr.Zero)CloseHandle(retainedJob);
            retainedJob=next;
            retainedName=name;
        }
        IntPtr handle=verifyOnly ? OpenJobObject(4,false,name) : retainedJob;
        if(handle==IntPtr.Zero)throw new Win32Exception();
        try {
            var info=new Rate { Flags=5, Value=percent*100 }; // ENABLE | HARD_CAP
            if(!verifyOnly && !SetInformationJobObject(handle,15,ref info,8))throw new Win32Exception();
            if(!QueryInformationJobObject(handle,15,out info,8,IntPtr.Zero))throw new Win32Exception();
            if(info.Flags!=5 || info.Value!=percent*100)throw new InvalidOperationException("CPU job budget mismatch");
            var checkedIds=new List<int>();
            foreach(int pid in processIds) {
                IntPtr process=OpenProcess(verifyOnly ? 0x1000u : 0x1141u,false,pid);
                if(process==IntPtr.Zero) {
                    int error=Marshal.GetLastWin32Error();
                    if(error==87)continue; // Process exited after enumeration.
                    throw new Win32Exception(error,"Cannot open CPU-budget process " + pid);
                }
                try {
                    bool member;
                    if(!IsProcessInJob(process,handle,out member))throw new Win32Exception();
                    if(!member) {
                        if(verifyOnly)throw new InvalidOperationException("Process outside CPU budget: " + pid);
                        // Keep one query-only job handle in each newly attached process.
                        // Closing the last handle otherwise removes the job's name even
                        // while its processes remain capped, causing nested caps on retry.
                        IntPtr keeper;
                        if(!DuplicateHandle(GetCurrentProcess(),handle,process,out keeper,4,false,0))throw new Win32Exception();
                        if(!AssignProcessToJobObject(handle,process)) {
                            int error=Marshal.GetLastWin32Error();
                            IntPtr discarded;
                            if(DuplicateHandle(process,keeper,GetCurrentProcess(),out discarded,0,false,3))CloseHandle(discarded);
                            throw new Win32Exception(error);
                        }
                    }
                    checkedIds.Add(pid);
                } finally { CloseHandle(process); }
            }
            return checkedIds.ToArray();
        } finally {
            // The watcher keeps the name alive during deploy restarts; target-owned
            // handles keep it alive during watcher restarts.
            // No KILL_ON_JOB_CLOSE: closing this handle must not terminate worlds.
            if(verifyOnly)CloseHandle(handle);
        }
    }
}
'@
}
$ids = if ($PSBoundParameters.ContainsKey('ProcessIds')) { $ProcessIds } elseif ($VerifyOnly) { @() } else { @($PID) }
$checked = [DauntlessCpuBudget]::Apply($Name,[uint32]$Percent,$VerifyOnly.IsPresent,[int[]]$ids)
[pscustomobject]@{ Name=$Name; Percent=$Percent; ProcessIds=@($checked) }
