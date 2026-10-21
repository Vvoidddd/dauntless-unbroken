param([Parameter(Mandatory=$true)][string]$Root,[switch]$StorageOnly,[switch]$Once)
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$Root=[IO.Path]::GetFullPath($Root)
$stateDir=Join-Path $Root 'watchdog'
$empty=@{};$retired=0
function Read-EmptyCount($file,$started,$now) {
    try {
        $info=Get-Item -LiteralPath $file
        if($info.LastWriteTimeUtc -lt $started -or ($now-$info.LastWriteTimeUtc).TotalSeconds -gt 90 -or $info.LastWriteTimeUtc -gt $now.AddSeconds(5)){return $null}
        $line=@(Get-Content -LiteralPath $file -Tail 8 | Where-Object {$_ -match '^net driver=IpNetDriver[^\r\n]* connections=\d+ owned=\d+ open=\d+\s*$'})[-1]
        if($line -match ' connections=(\d+) owned=(\d+) open=(\d+)\s*$'){
            $count=[int]$matches[1]
            if([int]$matches[2] -le $count -and [int]$matches[3] -le $count){return $count}
        }
    } catch {}
    return $null
}
function Test-EmptyInterval($spans,[string]$id,$count,[datetime]$now) {
    if($null -eq $count -or $count -ne 0){$spans.Remove($id);return $false}
    $s=$spans[$id]
    if(!$s -or $now -lt $s.last -or ($now-$s.last).TotalSeconds -gt 90){$s=@{since=$now;last=$now};$spans[$id]=$s}
    $s.last=$now
    return ($now-$s.since).TotalSeconds -ge 120
}
if($MyInvocation.InvocationName -eq '.'){return}
New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
do {
    $now=[datetime]::UtcNow;$tasks=@();$checks=@();$errorCount=0
    try {
        # Respect deliberate maintenance: never enable a disabled task or clear a stop flag.
        if(!(Test-Path -LiteralPath (Join-Path $Root 'data/run/stopped.flag'))){
            $names=if($StorageOnly){@('Dauntless Unbroken key bot','Dauntless Unbroken private tunnel','Dauntless Unbroken fleet monitor')}else{@('Dauntless Unbroken stack','Dauntless Unbroken allowlist','Dauntless Unbroken private tunnel','Dauntless Unbroken fleet monitor','Dauntless Unbroken dashboard','Dauntless Unbroken Discord status')}
            foreach($name in $names){
                $task=Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
                if(!$task){continue}
                if($task.State -notin @('Running','Disabled')){Start-ScheduledTask -TaskName $name}
                $tasks+=@{name=$name;state=[string](Get-ScheduledTask -TaskName $name).State}
            }
        }
        if(!$StorageOnly -and !(Test-Path -LiteralPath (Join-Path $Root 'data/run/stopped.flag'))){
            . "$Root/bin/DauntlessUnbrokenServer.Common.ps1"
            $p=Get-DRPaths $Root;$cfg=Get-DRConfig $Root
            $allocation=Invoke-RestMethod http://127.0.0.1:61001/gameservers -TimeoutSec 8
            # Only local temporary worlds. Ports are reused on the other host, so exclude relays.
            $worlds=@($allocation.servers|Where-Object {!$_.host -and $_.kind -in @('hunt','tutorial')})
            $udp=@(Get-NetUDPEndpoint)
            $processes=@(Get-DRGameServers $cfg.GameDir)
            $seen=@{}
            foreach($world in $worlds){
                $owners=@($udp|Where-Object LocalPort -eq $world.port|Select-Object -ExpandProperty OwningProcess -Unique)
                $proc=@($processes|Where-Object {$owners -contains $_.ProcessId})
                if($proc.Count -ne 1){continue};$proc=$proc[0]
                $started=$proc.CreationDate.ToUniversalTime()
                $id="$($world.id):$($proc.ProcessId):$($started.Ticks)";$seen[$id]=$true
                $dir=Join-Path "C:/Users/$($cfg.ServiceUser)/AppData/Local/Temp" "dauntless-unbroken-ready-$($proc.ParentProcessId)"
                $file=Join-Path $dir "native-fault-$($proc.ProcessId).log"
                $count=Read-EmptyCount $file $started $now
                $expired=Test-EmptyInterval $empty $id $count $now
                $checks+=@{port=$world.port;count=$count;emptySeconds=if($empty[$id]){[int]($now-$empty[$id].since).TotalSeconds}else{0}}
                if(!$expired){continue}
                # Recheck identity, world, socket ownership and a fresh zero immediately before stopping.
                $current=(Invoke-RestMethod http://127.0.0.1:61001/gameservers -TimeoutSec 8).servers|Where-Object {$_.id -eq $world.id -and !$_.host -and $_.kind -in @('hunt','tutorial') -and $_.port -eq $world.port}
                $live=Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ProcessId)"
                $owns=@(Get-NetUDPEndpoint -LocalPort $world.port -ErrorAction SilentlyContinue|Where-Object OwningProcess -eq $proc.ProcessId).Count -gt 0
                if($current -and $current.connectedPlayers -ceq 0 -and $live.CreationDate -eq $proc.CreationDate -and $live.ExecutablePath -eq $proc.ExecutablePath -and $owns -and (Read-EmptyCount $file $started ([datetime]::UtcNow)) -ceq 0){
                    Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
                    $retired++;$empty.Remove($id)
                }
            }
            foreach($id in @($empty.Keys)){if(!$seen[$id]){$empty.Remove($id)}}
        }
    }catch{$errorCount++}
    $record=@{at=[datetime]::UtcNow.ToString('o');tasks=$tasks;hunts=$checks;retired=$retired;errors=$errorCount;storageOnly=[bool]$StorageOnly}
    $file=Join-Path $stateDir 'health.json';$tmp="$file.tmp"
    $record|ConvertTo-Json -Depth 5 -Compress|Set-Content -LiteralPath $tmp -Encoding UTF8
    Move-Item -LiteralPath $tmp -Destination $file -Force
    if(!$Once){Start-Sleep -Seconds 15}
}while(!$Once)
