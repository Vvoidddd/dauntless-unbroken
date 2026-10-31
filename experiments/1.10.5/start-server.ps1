$ErrorActionPreference = 'Stop'
$lab = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$exe = Join-Path $lab 'game\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe'
$running = @(Get-CimInstance Win32_Process -Filter "Name = 'Dauntless-Win64-Shipping.exe'" | Where-Object ExecutablePath -eq $exe)
if ($running) { throw 'Close the isolated 1.10.5 instance before rebuilding it.' }
$config = Join-Path $lab 'profile\Saved\Config\WindowsClient\Engine.ini'
New-Item -ItemType Directory -Path (Split-Path $config) -Force | Out-Null
$settings = if (Test-Path -LiteralPath $config) { Get-Content -LiteralPath $config -Raw } else { '' }
if ($settings -notmatch '(?m)^ReplicationDriverClassName=/Script/Archon.ArchonReplicationGraph\r?$') {
    Add-Content -LiteralPath $config -Value "`n[/Script/OnlineSubsystemUtils.IpNetDriver]`nReplicationDriverClassName=/Script/Archon.ArchonReplicationGraph"
}
Copy-Item -LiteralPath (Join-Path $lab 'repo\experiments\1.10.5\bin\DauntlessUnbroken.dll') -Destination (Join-Path (Split-Path $exe) 'DauntlessUnbroken.dll') -Force
$env:DR_1105_LOCAL_LAB = '1'
$credential = (Get-Content -LiteralPath (Join-Path $lab 'backend-state\secrets.json') -Raw | ConvertFrom-Json).gameserverKey
if ($credential -notmatch '^[a-f0-9]{64}$') { throw 'Start the local backend first to create the server credential.' }
$env:DR_1105_GAMESERVER_KEY = $credential
Add-Content -LiteralPath (Join-Path $lab 'native-server.log') -Value "`nRUN $(Get-Date -Format o)"
$p = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -WindowStyle Hidden -PassThru -ArgumentList @('-server','-unattended','-nullrhi','-nosound','-EpicPortal','-NoEAC','-MULTIHOME=127.0.0.1','-port=62770','-CULTURE=en-US',"-UserDir=$lab/profile/",'-SaveToUserDir')
Set-Content -LiteralPath (Join-Path $lab 'native-server.pid') -Value $p.Id
Write-Output "Isolated server PID $($p.Id)"
