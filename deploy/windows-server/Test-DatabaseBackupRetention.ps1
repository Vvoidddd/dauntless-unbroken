$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('unbroken-retention-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $root|Out-Null
try {
    foreach($name in 'dauntless-unbroken-20260101-010101.db','dauntless-unbroken-20260102-010101.db','dauntless-unbroken-20260103-010101.db.partial','live.db'){
        [IO.File]::WriteAllText((Join-Path $root $name),'fixture')
    }
    $old=Get-Item (Join-Path $root 'dauntless-unbroken-20260101-010101.db');$old.CreationTimeUtc=[DateTime]::UtcNow.AddDays(-4);$old.LastWriteTimeUtc=[DateTime]::UtcNow
    $new=Get-Item (Join-Path $root 'dauntless-unbroken-20260102-010101.db');$new.LastWriteTimeUtc=[DateTime]::UtcNow.AddDays(-20)
    $lock=[IO.File]::Open((Join-Path $root 'weekly.lock'),'OpenOrCreate','ReadWrite','None')
    try {& "$PSScriptRoot/Prune-DatabaseBackups.ps1" -BackupRoot $root|Out-Null;if(!(Test-Path $old.FullName)){throw 'Active transfer was not protected'}} finally {$lock.Dispose()}
    & "$PSScriptRoot/Prune-DatabaseBackups.ps1" -BackupRoot $root|Out-Null
    if(Test-Path $old.FullName){throw 'Old creation time was not pruned'}
    if(!(Test-Path $new.FullName)){throw 'Recent creation time was pruned using modification time'}
    if(Test-Path (Join-Path $root 'dauntless-unbroken-20260103-010101.db.partial')){throw 'Orphan partial was retained'}
    if(!(Test-Path (Join-Path $root 'live.db'))){throw 'Unmanaged database was deleted'}
    'Backup retention checks passed'
} finally {
    $resolved=[IO.Path]::GetFullPath($root)
    if(!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notlike 'unbroken-retention-*'){throw 'Unsafe test cleanup'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
