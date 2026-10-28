$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('unbroken-retention-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $root|Out-Null
try {
    foreach($name in 'dauntless-unbroken-20260101-010101.db','dauntless-unbroken-20260102-010101.db','dauntless-unbroken-20260103-010101.db.partial','live.db'){
        [IO.File]::WriteAllText((Join-Path $root $name),'fixture')
    }
    $old=Get-Item (Join-Path $root 'dauntless-unbroken-20260101-010101.db');$old.CreationTimeUtc=[DateTime]::UtcNow.AddDays(-4);$old.LastWriteTimeUtc=[DateTime]::UtcNow
    $new=Get-Item (Join-Path $root 'dauntless-unbroken-20260102-010101.db');$new.LastWriteTimeUtc=[DateTime]::UtcNow.AddDays(-20)
    & "$PSScriptRoot/Prune-DatabaseBackups.ps1" -BackupRoot $root|Out-Null
    if(!(Test-Path $old.FullName)){throw 'Snapshots deleted before a verified replacement exists'}
    @{verified=$true;file=$new.Name;sha256=(Get-FileHash -LiteralPath $new.FullName).Hash}|ConvertTo-Json|Set-Content (Join-Path $root 'last-success.json')
    $lock=[IO.File]::Open((Join-Path $root 'weekly.lock'),'OpenOrCreate','ReadWrite','None')
    try {& "$PSScriptRoot/Prune-DatabaseBackups.ps1" -BackupRoot $root|Out-Null;if(!(Test-Path $old.FullName)){throw 'Active transfer was not protected'}} finally {$lock.Dispose()}
    & "$PSScriptRoot/Prune-DatabaseBackups.ps1" -BackupRoot $root|Out-Null
    if(Test-Path $old.FullName){throw 'Superseded snapshot was not pruned'}
    if(!(Test-Path $new.FullName)){throw 'Latest verified snapshot was pruned because of its age'}
    if(Test-Path (Join-Path $root 'dauntless-unbroken-20260103-010101.db.partial')){throw 'Orphan partial was retained'}
    if(!(Test-Path (Join-Path $root 'live.db'))){throw 'Unmanaged database was deleted'}
    [IO.File]::WriteAllText($new.FullName,'changed')
    $spare=Join-Path $root 'dauntless-unbroken-20260101-010101.db';[IO.File]::WriteAllText($spare,'fixture')
    $failed=$false
    try {& "$PSScriptRoot/Prune-DatabaseBackups.ps1" -BackupRoot $root|Out-Null}catch{$failed=$true}
    if(!$failed -or !(Test-Path $spare)){throw 'Changed replacement did not protect older snapshots'}
    'Backup retention checks passed'
} finally {
    $resolved=[IO.Path]::GetFullPath($root)
    if(!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolved) -notlike 'unbroken-retention-*'){throw 'Unsafe test cleanup'}
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
