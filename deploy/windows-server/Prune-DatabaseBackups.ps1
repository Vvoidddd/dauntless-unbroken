[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$BackupRoot)
$ErrorActionPreference='Stop'
$root=Get-Item -LiteralPath $BackupRoot
if(!$root.PSIsContainer -or ($root.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Backup root must be a real directory'}
$prefix=$root.FullName.TrimEnd('\')+'\'
$lockPath=Join-Path $root.FullName 'weekly.lock'
if((Test-Path -LiteralPath $lockPath) -and ((Get-Item -LiteralPath $lockPath).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Backup lock must not be a link'}
try {$lock=[IO.File]::Open($lockPath,'OpenOrCreate','ReadWrite','None')}
catch [IO.IOException] {Write-Output 'cleanup skipped: backup transfer is active';return}
$count=0;$bytes=0L
try {
    # A failed/missing transfer must never age out the last recovery point.
    $successPath=Join-Path $root.FullName 'last-success.json'
    if(!(Test-Path -LiteralPath $successPath)){Write-Output 'cleanup skipped: no verified snapshot';return}
    if((Get-Item -LiteralPath $successPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Backup success marker must not be a link'}
    $success=Get-Content -LiteralPath $successPath -Raw | ConvertFrom-Json
    if($success.verified -ne $true -or $success.file -notmatch '^dauntless-unbroken-\d{8}-\d{6}\.db$' -or $success.sha256 -notmatch '^[A-Fa-f0-9]{64}$'){throw 'Invalid verified snapshot marker'}
    $keep=Join-Path $root.FullName $success.file
    if(!(Test-Path -LiteralPath $keep)){Write-Output 'cleanup skipped: verified snapshot is missing';return}
    if((Get-Item -LiteralPath $keep).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Verified snapshot must not be a link'}
    if((Get-FileHash -LiteralPath $keep -Algorithm SHA256).Hash -ne $success.sha256){throw 'Verified snapshot hash changed; previous backups retained'}
    # Only this receiver's flat snapshots, never live databases, secrets or linked trees.
    foreach($item in Get-ChildItem -LiteralPath $root.FullName -File -Force){
        if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){continue}
        if(!$item.FullName.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Path outside backup root'}
        if($item.Name -notmatch '^dauntless-unbroken-\d{8}-\d{6}\.db(?<unfinished>\.partial|\.failed)?$'){continue}
        if($item.Name -eq $success.file){continue}
        if($PSCmdlet.ShouldProcess($item.FullName,'Delete snapshot superseded by verified replacement')){
            try {$handle=[IO.File]::Open($item.FullName,'Open','ReadWrite','None')}
            catch [IO.IOException] {continue}
            $handle.Dispose()
            Remove-Item -LiteralPath $item.FullName -Force
            $count++;$bytes+=$item.Length
        }
    }
} finally {$lock.Dispose()}
[pscustomobject]@{Deleted=$count;Bytes=$bytes;Kept=$success.file}
