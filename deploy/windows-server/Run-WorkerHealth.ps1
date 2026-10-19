param([Parameter(Mandatory=$true)][string]$Root,[switch]$StorageOnly,[string]$NodePath='node')
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$env:WORKER_ROOT=$Root
$env:WORKER_STORAGE_ONLY=if($StorageOnly){'1'}else{'0'}
if(!$StorageOnly){
    . "$PSScriptRoot/DauntlessUnbrokenServer.Common.ps1"
    $p=Get-DRPaths $Root
    $env:ALLOWLIST_SECRET=(Read-DREnv $p.AllowlistEnv)['ALLOWLIST_SECRET']
}
& $NodePath "$Root/monitor/worker-health.mjs"
exit $LASTEXITCODE
