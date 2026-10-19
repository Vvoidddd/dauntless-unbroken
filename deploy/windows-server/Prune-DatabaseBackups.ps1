[CmdletBinding(SupportsShouldProcess=$true)]
param([Parameter(Mandatory=$true)][string]$BackupRoot)
$ErrorActionPreference='Stop'
$root=Get-Item -LiteralPath $BackupRoot
if(!$root.PSIsContainer -or ($root.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Backup root must be a real directory'}
$prefix=$root.FullName.TrimEnd('\')+'\'
$cutoff=[DateTime]::UtcNow.AddDays(-3)
$lockPath=Join-Path $root.FullName 'weekly.lock'
if((Test-Path -LiteralPath $lockPath) -and ((Get-Item -LiteralPath $lockPath).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Backup lock must not be a link'}
try {$lock=[IO.File]::Open($lockPath,'OpenOrCreate','ReadWrite','None')}
catch [IO.IOException] {Write-Output 'cleanup skipped: backup transfer is active';return}
$count=0;$bytes=0L
try {
    # Only this receiver's flat snapshots, never live databases, secrets or linked trees.
    foreach($item in Get-ChildItem -LiteralPath $root.FullName -File -Force){
        if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){continue}
        if(!$item.FullName.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Path outside backup root'}
        if($item.Name -notmatch '^dauntless-unbroken-\d{8}-\d{6}\.db(?<unfinished>\.partial|\.failed)?$'){continue}
        if(!$Matches.unfinished -and $item.CreationTimeUtc -ge $cutoff){continue}
        if($PSCmdlet.ShouldProcess($item.FullName,'Delete incomplete or over-three-day database snapshot')){
            try {$handle=[IO.File]::Open($item.FullName,'Open','ReadWrite','None')}
            catch [IO.IOException] {continue}
            $handle.Dispose()
            Remove-Item -LiteralPath $item.FullName -Force
            $count++;$bytes+=$item.Length
        }
    }
} finally {$lock.Dispose()}
[pscustomobject]@{Deleted=$count;Bytes=$bytes;CutoffUtc=$cutoff.ToString('o');AgeField='CreationTimeUtc'}
