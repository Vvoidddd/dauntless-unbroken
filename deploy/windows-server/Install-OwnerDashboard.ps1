<# Installs the private, optional owner dashboard. No public firewall changes.
   Run elevated after installing/updating the kit. Backend health takes effect after
   the next metagame restart. -OpenOnLogon opens the locked page for this operator,
   never a browser in the service account's session. #>
[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$Root, [switch]$OpenOnLogon, [string]$FleetControlConfig, [string]$FleetKeyFile)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\DauntlessUnbrokenServer.Common.ps1"
$Root = Resolve-DRRoot $Root $PSScriptRoot
$P = Get-DRPaths $Root
$Cfg = Get-DRConfig $Root
if (-not $PSCmdlet.ShouldProcess($Root, 'Install private dashboard task and enable backend health')) { return }
if (-not (Test-DRAdmin)) { throw 'Run this installer as Administrator.' }
$dir = Join-Path $Root 'dashboard'
$controlDir = Join-Path $P.Data 'dashboard-control'
$drainFile = Join-Path $controlDir 'drain.flag'
# Refuse service-writable links before making privileged copies or ACL changes.
foreach ($path in @($Root, (Join-Path $Root 'data'), $dir, $controlDir, $P.Config, $P.Keys, $P.Logs, $P.OwnerKey, $P.ServerJson, $P.MetaEnv)) {
    if (Test-DRReparsePoint $path) { throw "Refusing linked path: $path" }
}
$files = @('dashboard.mjs','dashboard-maintenance.mjs','dashboard-fleet-control.mjs','dashboard-performance.mjs','dashboard-fleet.mjs','dashboard-worker.mjs','dashboard-client.js','dashboard-rewards.js','dashboard-support.js','dashboard.html')
foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath (Join-Path $P.App "tools\$file"))) { throw 'Update the server code before installing the dashboard.' }
}
$taskName = 'Dauntless Unbroken dashboard'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $taskName }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
icacls.exe $dir /inheritance:r /grant:r '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-18:(OI)(CI)F' '*S-1-5-19:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Dashboard ACL failed' }
foreach ($file in $files) {
    $destination = Join-Path $dir $file
    if (Test-DRReparsePoint $destination) { throw 'Refusing linked dashboard file' }
    Copy-Item -LiteralPath (Join-Path $P.App "tools\$file") -Destination $destination -Force
}
$logs = [ordered]@{}
foreach ($c in @('metagame','deploy','gateway','content')) { $logs[$c] = Join-Path $P.Logs "$c.out.log"; $logs["$c errors"] = Join-Path $P.Logs "$c.err.log" }
$logConfig = Join-Path $dir 'dashboard-logs.json'
foreach ($path in @($logConfig, (Join-Path $dir 'dashboard.env'))) { if (Test-DRReparsePoint $path) { throw 'Refusing linked dashboard configuration' } }
Write-DRText $logConfig ($logs | ConvertTo-Json -Compress)
$envMap = [ordered]@{
    DASHBOARD_OWNER_KEY_FILE = $P.OwnerKey.Replace('\', '/')
    DASHBOARD_BACKEND = "http://127.0.0.1:$(Get-DRPort $Cfg 'metagame')"
    DASHBOARD_PORT = '61110'
    DASHBOARD_LOG_CONFIG_FILE = $logConfig.Replace('\', '/')
    DASHBOARD_PERFORMANCE_DIR = (Join-Path $P.Logs 'performance').Replace('\', '/')
    DASHBOARD_DRAIN_FILE = $drainFile.Replace('\', '/')
}
if ((Get-DRMode $Cfg) -eq 'Public') { $envMap['DASHBOARD_SERVER_CONFIG'] = $P.ServerJson.Replace('\', '/') }
if ($FleetControlConfig) {
    if (-not [IO.Path]::IsPathRooted($FleetControlConfig)) { throw 'FleetControlConfig must be an absolute path.' }
    $FleetControlConfig = [IO.Path]::GetFullPath($FleetControlConfig)
    if (-not $FleetControlConfig.StartsWith("$controlDir\", [StringComparison]::OrdinalIgnoreCase)) { throw 'FleetControlConfig must be inside data\dashboard-control.' }
    if (-not (Test-Path -LiteralPath $FleetControlConfig -PathType Leaf)) { throw "Fleet control config not found: $FleetControlConfig" }
    if (Test-DRReparsePoint $FleetControlConfig) { throw 'Fleet control config may not be a linked file.' }
    $envMap['DASHBOARD_FLEET_CONTROL_CONFIG'] = $FleetControlConfig.Replace('\', '/')
}
if ($FleetKeyFile) {
    if (-not [IO.Path]::IsPathRooted($FleetKeyFile)) { throw 'FleetKeyFile must be an absolute path.' }
    $FleetKeyFile = [IO.Path]::GetFullPath($FleetKeyFile)
    if (-not $FleetKeyFile.StartsWith("$controlDir\", [StringComparison]::OrdinalIgnoreCase)) { throw 'FleetKeyFile must be inside data\dashboard-control.' }
    if (-not (Test-Path -LiteralPath $FleetKeyFile -PathType Leaf)) { throw "Fleet control key not found: $FleetKeyFile" }
    if (Test-DRReparsePoint $FleetKeyFile) { throw 'Fleet control key may not be a linked file.' }
    $envMap['DASHBOARD_FLEET_KEY_FILE'] = $FleetKeyFile.Replace('\', '/')
}
[void](Write-DREnv (Join-Path $dir 'dashboard.env') $envMap @('Private owner dashboard. No credentials in this file.'))
# Node resolves parent directories before reading its configuration. Grant only
# these directories RX: no inheritance and no recursive access to other secrets.
foreach ($path in @($Root, (Join-Path $Root 'data'), $P.Config, $P.Keys)) {
    icacls.exe $path /grant '*S-1-5-19:RX' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Dashboard parent directory ACL failed' }
}
if (-not (Test-Path -LiteralPath $controlDir)) { New-Item -ItemType Directory -Force -Path $controlDir | Out-Null }
$serviceSid = Get-DRLocalUserSid (Get-DRConfigValue $Cfg 'ServiceUser' 'dauntless')
if (-not $serviceSid) { throw 'The game service account could not be resolved.' }
Set-DRAcl $controlDir @{ 'S-1-5-32-544' = 'FullControl'; 'S-1-5-18' = 'FullControl'; $serviceSid = 'Modify'; 'S-1-5-19' = 'Modify' }
foreach ($path in @($FleetControlConfig, $FleetKeyFile)) {
    if ($path) { Set-DRAcl $path @{ 'S-1-5-32-544' = 'FullControl'; 'S-1-5-18' = 'FullControl'; 'S-1-5-19' = 'Read' } }
}
foreach ($path in @($P.OwnerKey, $P.ServerJson)) {
    icacls.exe $path /grant '*S-1-5-19:R' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Dashboard read ACL failed' }
}
icacls.exe $P.Logs /grant '*S-1-5-19:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Dashboard logs ACL failed' }
$meta = Read-DREnv $P.MetaEnv
$meta['BACKEND_HEALTH'] = '1'
[void](Write-DREnv $P.MetaEnv $meta $script:DRSecretEnvHeader)
$node = Get-DRConfigValue $Cfg 'NodePath' 'C:\Program Files\nodejs\node.exe'
$action = New-ScheduledTaskAction -Execute $node -Argument "--env-file=`"$dir\dashboard.env`" `"$dir\dashboard.mjs`"" -WorkingDirectory $dir
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger (New-ScheduledTaskTrigger -AtStartup) -Settings $settings -Description 'Private owner dashboard on loopback; LocalService, not administrator.' -Force | Out-Null
Set-DRConfigValue $Cfg 'DashboardEnabled' $true
if ($OpenOnLogon) {
    $operator = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $openTask = 'Dauntless Unbroken open dashboard'
    $openAction = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSScriptRoot\Open-OwnerDashboard.ps1`""
    Register-ScheduledTask -TaskName $openTask -Action $openAction -Principal (New-ScheduledTaskPrincipal -UserId $operator -LogonType Interactive -RunLevel Limited) -Trigger (New-ScheduledTaskTrigger -AtLogOn -User $operator) -Settings (New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 2)) -Description 'Open the locked owner page in the operator session, never in the service session.' -Force | Out-Null
    Set-DRConfigValue $Cfg 'DashboardOpenOnStart' $true
}
Save-DRConfig $Root $Cfg
Start-ScheduledTask -TaskName $taskName
Write-Host 'Dashboard installed: http://127.0.0.1:61110 (RDP browser or SSH tunnel).'
Write-Host 'Backend health is enabled for the next metagame start. No game processes were restarted.'
