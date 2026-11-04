$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'maintenance-config.ps1')
$hosted = [pscustomobject]@{ workerUrl = 'http://127.0.0.1:62101' }

$env:DR_1105_WORKER_URL = 'http://127.0.0.1:62101'
Set-DRMaintenanceWorkerEnvironment @{ MAINTENANCE_MODE = '1' } $hosted
if (Test-Path Env:DR_1105_WORKER_URL) { throw 'maintenance mode left the worker route enabled' }

Set-DRMaintenanceWorkerEnvironment @{ MAINTENANCE_MODE = '0' } $hosted
if ($env:DR_1105_WORKER_URL -ne $hosted.workerUrl) { throw 'normal mode did not restore the worker route' }
Remove-Item Env:DR_1105_WORKER_URL -ErrorAction SilentlyContinue
Write-Output 'Worker routing maintenance test passed.'
