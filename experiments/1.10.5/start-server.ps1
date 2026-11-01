param([ValidateSet('ramsgate','dojo')][string]$World = 'ramsgate')
$ErrorActionPreference = 'Stop'
$lab = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$exe = Join-Path $lab 'game\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe'
$running = @(Get-CimInstance Win32_Process -Filter "Name = 'Dauntless-Win64-Shipping.exe'" | Where-Object ExecutablePath -eq $exe)
$port = if ($World -eq 'dojo') { 62771 } else { 62770 }
$stem = if ($World -eq 'dojo') { 'native-dojo' } else { 'native-server' }
$profile = if ($World -eq 'dojo') { 'profile-dojo' } else { 'profile' }
if (Get-NetUDPEndpoint -LocalPort $port -ErrorAction SilentlyContinue) { throw "Local world port $port is already in use." }
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
$credential = (Get-Content -LiteralPath (Join-Path $lab 'backend-state\secrets.json') -Raw | ConvertFrom-Json).gameserverKey
if ($credential -notmatch '^[a-f0-9]{64}$') { throw 'Start the local backend first to create the server credential.' }
$env:DR_1105_GAMESERVER_KEY = $credential
Add-Content -LiteralPath (Join-Path $lab "$stem.log") -Value "`nRUN $(Get-Date -Format o)"
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -WindowStyle Hidden -PassThru -ArgumentList @('-server','-unattended','-nullrhi','-nosound','-EpicPortal','-NoEAC','-MULTIHOME=127.0.0.1',"-port=$port",'-CULTURE=en-US',"-UserDir=$lab/$profile/",'-SaveToUserDir')
Set-Content -LiteralPath (Join-Path $lab "$stem.pid") -Value $p.Id
Write-Output "Isolated $World server PID $($p.Id) on 127.0.0.1:$port"
