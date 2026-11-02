# Run as a persistent startup task. Attach deploy first so future worlds inherit
# the shared budget, then attach worlds that were already running.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Root,
    [Parameter(Mandatory=$true)][ValidateRange(1,100)][int]$Percent,
    [Parameter(Mandatory=$true)][string]$Name,[switch]$QueueAtBudget)
$ErrorActionPreference='Stop'
. "$PSScriptRoot\DauntlessUnbrokenServer.Common.ps1"
$paths=Get-DRPaths $Root
$config=Get-Content -LiteralPath (Join-Path $paths.Config 'server.json') -Raw | ConvertFrom-Json
$gameDir=Get-DRConfigValue $config 'GameDir' ''
if (-not $gameDir) { throw 'GameDir is missing from server.json' }
. "$PSScriptRoot\CpuBudgetAdmission.ps1"
$previous=$null
$clock=[Diagnostics.Stopwatch]::StartNew()
$processors=[int](Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
$drain=Join-Path $paths.App 'DauntlessUnbrokenDeployServer/drain.flag'
while ($true) {
    $deploy=@(Get-DRComponentProcesses $paths 'deploy' | ForEach-Object { [int]$_.ProcessId })
    $games=@(Get-DRGameServers $gameDir | ForEach-Object { [int]$_.ProcessId })
    $ids=@($deploy + $games | Select-Object -Unique)
    if ($ids.Count) {
        $result=& "$PSScriptRoot\Set-ProcessCpuBudget.ps1" -Percent $Percent -Name $Name -ProcessIds $ids
        $now=$clock.Elapsed.TotalSeconds
        if($QueueAtBudget -and $previous -and $now -gt $previous.time -and $result.CpuTimeTicks -ge $previous.ticks){
            # Job accounting includes departed processes; process churn cannot reset usage.
            $usage=100*($result.CpuTimeTicks-$previous.ticks)/10000000/($now-$previous.time)/$processors
            $paused=Update-CpuBudgetAdmission -Path $drain -Usage $usage -Budget $Percent
            $result | Add-Member -NotePropertyName UsagePercent -NotePropertyValue ([math]::Round($usage,2))
            $result | Add-Member -NotePropertyName AdmissionPaused -NotePropertyValue $paused
        }
        $previous=@{time=$now;ticks=$result.CpuTimeTicks}
        $result | Add-Member -NotePropertyName CheckedUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
        $status=Join-Path $paths.Run 'cpu-budget.json'
        $result | ConvertTo-Json -Compress | Set-Content -LiteralPath "$status.tmp" -Encoding UTF8
        Move-Item -LiteralPath "$status.tmp" -Destination $status -Force
    }
    Start-Sleep -Seconds 5
}
