# Forced-command target for a read-only SSH backup key. No arbitrary shell/SFTP.
param([Parameter(Mandatory=$true)][string]$BackupRoot)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$root=Get-Item -LiteralPath $BackupRoot
if(!$root.PSIsContainer -or ($root.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Invalid backup root'}
function SnapshotFile([string]$path){
    $file=Get-Item -LiteralPath $path
    $dir=$file.Directory
    if($file.PSIsContainer -or $file.Length -le 0 -or $file.Name -ne 'dauntless-unbroken.db' -or $dir.Name -notmatch '^\d{4}-\d{2}-\d{2}_\d{6}$' -or $dir.Parent.FullName -ne $root.FullName -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Not a managed database snapshot'}
    $marker=Get-Item -LiteralPath (Join-Path $dir.FullName 'completed.json')
    if(($marker.Attributes -band [IO.FileAttributes]::ReparsePoint) -or (Get-Content -LiteralPath $marker.FullName -Raw|ConvertFrom-Json).verified -ne $true){throw 'Snapshot is not complete'}
    return $file
}
$command=$env:SSH_ORIGINAL_COMMAND
if($command -eq 'snapshot-info'){
    $file=Get-ChildItem -LiteralPath $root.FullName -Directory|Where-Object {$_.Name -match '^\d{4}-\d{2}-\d{2}_\d{6}$' -and !($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -and (Test-Path -LiteralPath (Join-Path $_.FullName 'completed.json'))}|Sort-Object Name -Descending|ForEach-Object {Get-Item -LiteralPath (Join-Path $_.FullName 'dauntless-unbroken.db') -ErrorAction SilentlyContinue}|Where-Object {$_.Length -gt 0 -and $_.LastWriteTimeUtc -gt [DateTime]::UtcNow.AddHours(-2)}|Select-Object -First 1
    if(!$file){throw 'No fresh database snapshot'}
    $file=SnapshotFile $file.FullName
    @{path=$file.FullName.Replace('\','/');hash=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}|ConvertTo-Json -Compress
}elseif($command -match '^scp(?:\.exe)? -f ([A-Za-z]:[/\\][A-Za-z0-9_./\\-]+)$'){
    $file=SnapshotFile $Matches[1]
    & "$env:SystemRoot/System32/OpenSSH/scp.exe" -f $file.FullName
    exit $LASTEXITCODE
}else{throw 'Only snapshot-info and managed snapshot reads are allowed'}
