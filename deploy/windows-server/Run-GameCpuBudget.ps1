# Run as a persistent startup task. Attach deploy first so future worlds inherit
# the shared budget, then attach worlds that were already running.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Root,
    [Parameter(Mandatory=$true)][ValidateRange(1,100)][int]$Percent,
    [Parameter(Mandatory=$true)][string]$Name)
$ErrorActionPreference='Stop'
. "$PSScriptRoot\DauntlessUnbrokenServer.Common.ps1"
$paths=Get-DRPaths $Root
$config=Get-Content -LiteralPath (Join-Path $paths.Config 'server.json') -Raw | ConvertFrom-Json
$gameDir=Get-DRConfigValue $config 'GameDir' ''
if (-not $gameDir) { throw 'GameDir is missing from server.json' }
while ($true) {
    $deploy=@(Get-DRComponentProcesses $paths 'deploy' | ForEach-Object { [int]$_.ProcessId })
    $games=@(Get-DRGameServers $gameDir | ForEach-Object { [int]$_.ProcessId })
    $ids=@($deploy + $games | Select-Object -Unique)
    if ($ids.Count) {
        $result=& "$PSScriptRoot\Set-ProcessCpuBudget.ps1" -Percent $Percent -Name $Name -ProcessIds $ids
        $result | Add-Member -NotePropertyName CheckedUtc -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
        $status=Join-Path $paths.Run 'cpu-budget.json'
        $result | ConvertTo-Json -Compress | Set-Content -LiteralPath "$status.tmp" -Encoding UTF8
        Move-Item -LiteralPath "$status.tmp" -Destination $status -Force
    }
    Start-Sleep -Seconds 5
}
