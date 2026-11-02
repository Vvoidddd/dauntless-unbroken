param([ValidateSet('ramsgate','dojo','combat-probe')][string]$World = 'ramsgate', [string]$BindIp = '127.0.0.1', [string]$Hunt = 'ShatteredIsles_IslandA', [ValidateRange(63872,63935)][int]$HuntPort = 63872, [string]$Players = '')
$ErrorActionPreference = 'Stop'
$lab = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$exe = Join-Path $lab 'game\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe'
$running = @(Get-CimInstance Win32_Process -Filter "Name = 'Dauntless-Win64-Shipping.exe'" | Where-Object ExecutablePath -eq $exe)
$parsed = $null
if (![Net.IPAddress]::TryParse($BindIp,[ref]$parsed) -or ($BindIp -notin @('127.0.0.1','0.0.0.0') -and $BindIp -notmatch '^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}$')) { throw 'Use loopback, all interfaces, or a Tailscale IPv4 address.' }
$port = if ($World -eq 'combat-probe') { $HuntPort } elseif ($World -eq 'dojo') { 63871 } else { 63870 }
$stem = if ($World -eq 'combat-probe') { "native-hunt-$port" } elseif ($World -eq 'dojo') { 'native-dojo' } else { 'native-server' }
$profile = if ($World -eq 'combat-probe') { "profile-hunt-$port" } elseif ($World -eq 'dojo') { 'profile-dojo' } else { 'profile' }
if ($World -eq 'combat-probe') {
    $catalog = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'hunting-grounds.json') -Raw | ConvertFrom-Json
    $entry = $catalog.PSObject.Properties[$Hunt].Value
    if (!$entry) { throw 'This hunt is not in the verified 1.10.5 map catalog.' }
    $ids = @($Players -split ',' | Where-Object { $_ })
    if ($ids.Count -gt 4 -or @($ids | Where-Object { $_ -notmatch '^UID-[a-fA-F0-9-]{36}$' }).Count) { throw 'Invalid expected account IDs.' }
    $playerHunts = ($ids | ForEach-Object { "${_}:$Hunt" }) -join ','
    $env:DR_1105_HUNT_URL = if ($Hunt -eq 'Tutorial') { $entry.url } else { "$($entry.map)?game=$($entry.gameMode)?HuntId=$($entry.matchmaker)?MaxPlayers=$($entry.maxPlayers)?PlayerHuntIds=$playerHunts" }
    $env:DR_1105_HUNT_PORT = [string]$port
}
if (Get-NetUDPEndpoint -LocalPort $port -ErrorAction SilentlyContinue) { throw "Local world port $port is already in use." }
$probe = New-Object Net.Sockets.UdpClient
try { $probe.Client.Bind((New-Object Net.IPEndPoint($parsed,$port))) }
finally { $probe.Dispose() }
$pidFile = Join-Path $lab "$stem.pid"
if (Test-Path -LiteralPath $pidFile) {
    $old = Get-CimInstance Win32_Process -Filter "ProcessId=$([int](Get-Content -LiteralPath $pidFile))"
    if ($old -and $old.ExecutablePath -eq $exe) { throw "$World is already running as PID $($old.ProcessId). Check its UDP listener before starting another." }
}
$builtDll = Join-Path $lab 'repo\experiments\1.10.5\bin\DauntlessUnbroken.dll'
$installedDll = Join-Path (Split-Path $exe) 'DauntlessUnbroken.dll'
if ($running) {
    if (!(Test-Path -LiteralPath $installedDll) -or (Get-FileHash -LiteralPath $builtDll).Hash -ne (Get-FileHash -LiteralPath $installedDll).Hash) {
        throw 'Close the isolated 1.10.5 game and servers before installing a rebuilt DLL.'
    }
} else { Copy-Item -LiteralPath $builtDll -Destination $installedDll -Force }
$config = Join-Path $lab "$profile\Saved\Config\WindowsClient\Engine.ini"
New-Item -ItemType Directory -Path (Split-Path $config) -Force | Out-Null
$settings = if (Test-Path -LiteralPath $config) { Get-Content -LiteralPath $config -Raw } else { '' }
if ($settings -notmatch '(?m)^ReplicationDriverClassName=/Script/Archon.ArchonReplicationGraph\r?$') {
    Add-Content -LiteralPath $config -Value "`n[/Script/OnlineSubsystemUtils.IpNetDriver]`nReplicationDriverClassName=/Script/Archon.ArchonReplicationGraph"
}
$env:DR_1105_LOCAL_LAB = '1'
$env:DR_1105_WORLD = $World
$env:DR_1105_BIND_IP = $BindIp
$credential = (Get-Content -LiteralPath (Join-Path $lab 'backend-state\secrets.json') -Raw | ConvertFrom-Json).gameserverKey
if ($credential -notmatch '^[a-f0-9]{64}$') { throw 'Start the local backend first to create the server credential.' }
$env:DR_1105_GAMESERVER_KEY = $credential
Add-Content -LiteralPath (Join-Path $lab "$stem.log") -Value "`nRUN $(Get-Date -Format o)"
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -WindowStyle Hidden -PassThru -ArgumentList @('-server','-unattended','-nullrhi','-nosound','-EpicPortal','-NoEAC',"-MULTIHOME=$BindIp","-port=$port",'-CULTURE=en-US',"-UserDir=$lab/$profile/",'-SaveToUserDir')
if($env:DR_1105_CPU_BUDGET){
    try{& (Join-Path $lab 'repo/deploy/windows-server/Set-ProcessCpuBudget.ps1') -Percent ([int]$env:DR_1105_CPU_BUDGET) -Name 'Global\DauntlessUnbrokenEU1Cpu' -ProcessIds @($p.Id) | Out-Null}
    catch{Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue;throw}
}
Set-Content -LiteralPath (Join-Path $lab "$stem.pid") -Value $p.Id
Write-Output "Isolated $World server PID $($p.Id) on ${BindIp}:$port"
