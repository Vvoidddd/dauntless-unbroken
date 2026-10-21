param([Parameter(Mandatory=$true)][string]$Root,[switch]$StorageOnly)
$ErrorActionPreference='Stop'
$Root=[IO.Path]::GetFullPath($Root)
$dir=Join-Path $Root 'watchdog'
New-Item -ItemType Directory -Force -Path $dir|Out-Null
# This SYSTEM task executes administrator-owned code; the game service gets read access only.
icacls.exe $dir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX' '*S-1-5-32-545:(OI)(CI)RX'|Out-Null
if($LASTEXITCODE -ne 0){throw 'Watchdog ACL failed'}
Copy-Item -LiteralPath "$PSScriptRoot/Run-FleetWatchdog.ps1" -Destination "$dir/Run-FleetWatchdog.ps1" -Force
$taskArgs="-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$dir/Run-FleetWatchdog.ps1`" -Root `"$Root`""
if($StorageOnly){$taskArgs+=' -StorageOnly'}
$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs -WorkingDirectory $Root
$principal=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([timespan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$name='Dauntless Unbroken fleet watchdog'
Register-ScheduledTask -TaskName $name -Action $action -Principal $principal -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $settings -Force|Out-Null
Start-ScheduledTask -TaskName $name
