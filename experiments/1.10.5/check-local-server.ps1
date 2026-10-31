param([switch]$RequireConnection)
$ErrorActionPreference = 'Stop'
$lab = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$serverId = [int](Get-Content -LiteralPath (Join-Path $lab 'native-server.pid') -Raw)
$server = Get-Process -Id $serverId
if ($server.Path -ne (Join-Path $lab 'game\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe')) { throw 'Unexpected server executable.' }
$listener = @(Get-NetUDPEndpoint -LocalPort 62770 | Where-Object { $_.LocalAddress -eq '127.0.0.1' -and $_.OwningProcess -eq $serverId })
if (!$listener) { throw 'Local server has no loopback UDP listener.' }
$log = Get-Content -LiteralPath (Join-Path $lab 'native-server.log') -Raw
$start = $log.LastIndexOf('RUN ')
if ($start -lt 0) { throw 'No server run marker.' }
$run = $log.Substring($start)
if ($run -match 'access_violation|_failed|_mismatch') { throw 'Native failure recorded in current run.' }
$ticks = [regex]::Matches($run, 'engine_tick world=([0-9A-F]+) name=ramsgate_01_persistent driver=([0-9A-F]+) graph=([0-9A-F]+) clients=(\d+) frame=(\d+) flags=1/0')
if ($ticks.Count -lt 2) { throw 'Wait for two server samples.' }
foreach ($tick in @($ticks[$ticks.Count-2], $ticks[$ticks.Count-1])) {
    if ($tick.Groups[2].Value -match '^0+$' -or $tick.Groups[3].Value -match '^0+$') { throw 'Network driver or replication graph missing.' }
}
if ($RequireConnection -and !(@($ticks | Where-Object { [int]$_.Groups[4].Value -gt 0 -and [int]$_.Groups[5].Value -gt 0 }).Count)) {
    throw 'No connected client with advancing replication observed in this run.'
}
Write-Output 'Local server: correct process, loopback UDP listener, persistent world driver and replication graph verified.'
if ($RequireConnection) { Write-Output 'A client connection and nonzero replication frame were observed; possession and gameplay still require testing.' }
