param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('C:\Unbroken1105', 'E:\Unbroken1105')]
    [string]$Root,

    [Parameter(Mandatory = $true)]
    [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
    [string]$Candidate,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[A-Fa-f0-9]{64}$')]
    [string]$ExpectedCandidateHash,

    [switch]$AllowProduction
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

if (-not $AllowProduction) {
    throw 'Refusing production deployment. Re-run with -AllowProduction after maintenance approval.'
}

$task = 'Unbroken1105-PublicRealm'
$stage = Join-Path $Root 'staging\production-maintenance'
$exe = Join-Path $Root 'game\Archon\Binaries\Win64\Dauntless-Win64-Shipping.exe'
$installed = Join-Path (Split-Path -Parent $exe) 'DauntlessUnbroken.dll'
$drain = Join-Path $Root 'backend-state\drain.flag'
$allocator = Join-Path $Root 'repo\experiments\1.10.5\local-deploy.cjs'
$readiness = Join-Path $Root 'repo\experiments\1.10.5\hunt-readiness.cjs'
$backup = Join-Path $stage ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) { throw "Game executable is missing: $exe" }
if (-not (Test-Path -LiteralPath $installed -PathType Leaf)) { throw "Installed DLL is missing: $installed" }
if (-not (Test-Path -LiteralPath $allocator -PathType Leaf)) { throw "Allocator is missing: $allocator" }
if (Test-Path -LiteralPath $readiness) { throw "Unexpected readiness override exists: $readiness" }

$actualCandidateHash = (Get-FileHash -LiteralPath $Candidate -Algorithm SHA256).Hash
if ($actualCandidateHash -ne $ExpectedCandidateHash.ToUpperInvariant()) {
    throw "Candidate hash mismatch. Expected $ExpectedCandidateHash, got $actualCandidateHash."
}

$exeHash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
$candidateCopy = Join-Path $stage 'candidate.dll'
$hadDrain = Test-Path -LiteralPath $drain
$started = $false

function Get-OwnedGameProcesses {
    @(Get-CimInstance Win32_Process -Filter "Name = 'Dauntless-Win64-Shipping.exe'" |
        Where-Object { $_.ExecutablePath -ieq $exe })
}

function Stop-OwnedProcesses {
    $processes = Get-OwnedGameProcesses
    foreach ($process in $processes) {
        if ($process.CommandLine -notmatch '(^|\s)-server(\s|$)') {
            throw "Refusing to stop an owned executable without -server: PID $($process.ProcessId)."
        }
        Stop-Process -Id $process.ProcessId -Force
    }
    Start-Sleep -Seconds 3
    if (@(Get-OwnedGameProcesses).Count -gt 0) { throw 'A production game process did not stop.' }
}

function Start-Supervisor {
    & schtasks.exe /run /tn $task | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not start scheduled task $task." }
    $deadline = (Get-Date).AddSeconds(60)
    do {
        Start-Sleep -Seconds 2
        if (Get-NetTCPConnection -LocalPort 62001 -State Listen -ErrorAction SilentlyContinue) {
            $script:started = $true
            return
        }
    } while ((Get-Date) -lt $deadline)
    throw 'Production allocator did not listen on 127.0.0.1:62001.'
}

try {
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    Copy-Item -LiteralPath $Candidate -Destination $candidateCopy
    Copy-Item -LiteralPath $installed -Destination (Join-Path $backup 'installed.dll')
    Copy-Item -LiteralPath $allocator -Destination (Join-Path $backup 'allocator')

    # Maintenance stays enabled after a successful deployment until an operator removes the flag.
    Set-Content -LiteralPath $drain -Value 'manual maintenance' -NoNewline

    & schtasks.exe /end /tn $task | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not stop scheduled task $task." }
    Stop-OwnedProcesses

    Copy-Item -LiteralPath $candidateCopy -Destination $installed -Force
    if ((Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash -ne $actualCandidateHash) {
        throw 'Installed DLL hash does not match the verified candidate.'
    }

    Start-Supervisor
    Write-Output "Production deployment completed with maintenance enabled. Backup: $backup"
}
catch {
    Write-Output "Deployment failed: $($_.Exception.Message). Restoring the previous installation."
    try { & schtasks.exe /end /tn $task 2>$null | Out-Null } catch { }
    try { Stop-OwnedProcesses } catch { }
    if (Test-Path -LiteralPath (Join-Path $backup 'installed.dll')) {
        Copy-Item -LiteralPath (Join-Path $backup 'installed.dll') -Destination $installed -Force
    }
    if (Test-Path -LiteralPath (Join-Path $backup 'allocator')) {
        Copy-Item -LiteralPath (Join-Path $backup 'allocator') -Destination $allocator -Force
    }
    if ($hadDrain) {
        Set-Content -LiteralPath $drain -Value 'manual maintenance' -NoNewline
    } elseif (-not (Test-Path -LiteralPath $drain)) {
        New-Item -ItemType File -Path $drain | Out-Null
        Set-Content -LiteralPath $drain -Value 'manual maintenance' -NoNewline
    }
    try { Start-Supervisor } catch { Write-Output "Rollback supervisor start failed: $($_.Exception.Message)" }
    throw
}
