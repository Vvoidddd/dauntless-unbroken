[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Root,
    [string]$SourceHost,
    [string]$SourceRoot = 'C:\DauntlessUnbroken',
    [string]$IdentityFile,
    [string]$NodePath='node'
)
$ErrorActionPreference = 'Stop'
if (!$SourceHost -or !$IdentityFile) { throw 'SourceHost and IdentityFile are required' }
$dest = Join-Path $Root 'backups'
New-Item -ItemType Directory -Force $dest | Out-Null
if((Get-Item -LiteralPath $dest).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Backup destination must not be a link'}
if((Test-Path -LiteralPath (Join-Path $dest 'weekly.lock')) -and ((Get-Item -LiteralPath (Join-Path $dest 'weekly.lock')).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Backup lock must not be a link'}
$lock = [IO.File]::Open((Join-Path $dest 'weekly.lock'),'OpenOrCreate','ReadWrite','None')
$partial=$null
function RunCopy([string]$exe,[string[]]$arguments,[int]$timeoutSeconds){
    $out=Join-Path $dest 'transfer.out.log';$err=Join-Path $dest 'transfer.err.log'
    $quoted=@($arguments|ForEach-Object {'"'+$_.Replace('"','\"')+'"'})
    $process=Start-Process -FilePath $exe -ArgumentList $quoted -WindowStyle Hidden -PassThru -RedirectStandardOutput $out -RedirectStandardError $err
    $null=$process.Handle # Keep the Windows PowerShell 5.1 process handle for ExitCode.
    if(!$process.WaitForExit($timeoutSeconds*1000)){Stop-Process -Id $process.Id -Force;throw 'Snapshot transfer timed out'}
    $process.WaitForExit()
    if($process.ExitCode -ne 0){throw 'Snapshot SSH/SCP command failed; inspect transfer.err.log'}
    return [IO.File]::ReadAllText($out)
}
try {
    $knownHosts = Join-Path $Root 'data/tunnels/realm-known-hosts'
    $result = RunCopy (Get-Command ssh.exe).Source @('-n','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-o','StrictHostKeyChecking=yes','-o',"UserKnownHostsFile=$knownHosts",'-o','ConnectTimeout=15','-i',$IdentityFile,"Administrator@$SourceHost",'snapshot-info') 30
    $info = ($result -join "`n") | ConvertFrom-Json
    $expectedPrefix=$SourceRoot.Replace('\','/').TrimEnd('/')+'/backups/'
    if ($info.hash -notmatch '^[A-Fa-f0-9]{64}$' -or !$info.path.StartsWith($expectedPrefix,[StringComparison]::OrdinalIgnoreCase) -or $info.path -notmatch '/backups/\d{4}-\d{2}-\d{2}_\d{6}/dauntless-unbroken\.db$') { throw 'Invalid source backup metadata' }
    $name = 'dauntless-unbroken-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.db'
    $partial = Join-Path $dest ($name+'.partial')
    if(Test-Path -LiteralPath $partial){throw 'Snapshot destination already exists'}
    $scp=(Get-Command scp.exe).Source
    # Windows inbox OpenSSH 8.x already uses SCP and rejects -O; 9.x needs it
    # to avoid SFTP (the source key intentionally has no SFTP/shell access).
    $legacy=if([Diagnostics.FileVersionInfo]::GetVersionInfo($scp).FileMajorPart -ge 9){@('-O')}else{@()}
    $null=RunCopy $scp ($legacy+@('-q','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-o','StrictHostKeyChecking=yes','-o',"UserKnownHostsFile=$knownHosts",'-o','ConnectTimeout=15','-i',$IdentityFile,"Administrator@${SourceHost}:$($info.path)",$partial)) 900
    if ((Get-FileHash $partial -Algorithm SHA256).Hash -ne $info.hash) { throw 'Transferred database hash mismatch' }
    $verifier = Join-Path $Root 'Verify-Backup.mjs'
    'import {DatabaseSync} from "node:sqlite"; const d=new DatabaseSync(process.argv[2],{readOnly:true});if(d.prepare("PRAGMA quick_check").get().quick_check!=="ok")throw Error("Database check failed");d.close();' | Set-Content $verifier -Encoding ascii
    & $NodePath $verifier $partial
    if ($LASTEXITCODE) { throw 'Transferred database integrity check failed' }
    Move-Item -LiteralPath $partial -Destination (Join-Path $dest $name)
    @{at=[DateTime]::UtcNow.ToString('o');file=$name;sha256=$info.hash;verified=$true} | ConvertTo-Json | Set-Content (Join-Path $dest 'last-success.json')
    Write-Output "Verified database snapshot: $name"
} finally {
    if($partial -and (Test-Path -LiteralPath $partial)){Remove-Item -LiteralPath $partial -Force}
    $lock.Dispose()
    & "$PSScriptRoot/Prune-DatabaseBackups.ps1" -BackupRoot $dest
}
