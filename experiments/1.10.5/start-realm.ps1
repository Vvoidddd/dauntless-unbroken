param([switch]$NoBrowser,[switch]$NoWorlds)
$ErrorActionPreference = 'Stop'
$lab = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$node = if(Test-Path (Join-Path $lab 'runtime/node.exe')){Join-Path $lab 'runtime/node.exe'}elseif(Test-Path 'C:/DauntlessUnbrokenBot/runtime/nodejs/node.exe'){'C:/DauntlessUnbrokenBot/runtime/nodejs/node.exe'}else{(Get-Command node.exe).Source}
$node=[IO.Path]::GetFullPath($node)
$hostedFile=Join-Path $lab 'backend-state\hosted.json'
if(Test-Path -LiteralPath $hostedFile){
 $hosted=Get-Content -LiteralPath $hostedFile -Raw | ConvertFrom-Json
 $ip='0.0.0.0'
 $publicPort=if($hosted.publicPort){[int]$hosted.publicPort}else{62002}
 $config=@{Mode='Public';PublicHost=$hosted.host;CertFingerprint=$hosted.fingerprint;ServerName='Dauntless Unbroken';Ports=@{gateway=$publicPort;deploy=62001}}
 $env:DR_1105_PUBLIC_HOST=if($hosted.gameHost){$hosted.gameHost}else{$hosted.host}
 $env:DR_1105_MAX_HUNTS=if($hosted.maxHunts){[string]$hosted.maxHunts}else{'4'}
 $env:DR_1105_WORKER=if($hosted.role -eq 'worker'){'1'}else{'0'}
 $env:DR_1105_WORKER_URL=$hosted.workerUrl
 $env:GAMESERVER_CPU_GUARD='1'
 $env:GAMESERVER_CPU_LIMIT_PERCENT=if($hosted.cpuLimit){[string]$hosted.cpuLimit}else{'80'}
 $env:GAMESERVER_CPU_RESUME_PERCENT=if($hosted.cpuResume){[string]$hosted.cpuResume}else{'65'}
 $env:GAMESERVER_MEMORY_GUARD='1'
 $env:DRAIN_FILE=Join-Path $lab 'backend-state/drain.flag'
 $env:DR_1105_CPU_BUDGET=if($hosted.cpuBudget){[string]$hosted.cpuBudget}else{''}
}else{
$ts = & 'C:\Program Files\Tailscale\tailscale.exe' status --json | ConvertFrom-Json
if ($ts.BackendState -ne 'Running') { throw 'Sign into Tailscale first.' }
$ip = @($ts.TailscaleIPs | Where-Object { $_ -match '^100\.' })[0]
if (!$ip) { throw 'Tailscale IPv4 address missing.' }
$config = @{Mode='Local1105';PublicHost=$ip;ServerName='Unbroken 1.10.5 Test Realm';Ports=@{gateway=62002;deploy=62001}}
}
[IO.File]::WriteAllText((Join-Path $lab 'backend-state\realm-config.json'),($config | ConvertTo-Json -Depth 4),(New-Object Text.UTF8Encoding($false)))
$env:LOCAL_1105_REALM = '1'
$env:DR_1105_BIND_IP = $ip
$env:DR_1105_DUMP_HUNTS = '1'
function Start-LabNode([string]$Name,[string]$Script,[int]$Port) {
    $listener = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object RemotePort -eq 0 | Select-Object -First 1
    if ($listener) {
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        $expected = $proc.CommandLine.Replace('/','\') -like ('*'+$Script.Replace('/','\')+'*')
        if ($Name -eq 'realm-backend') {
            $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)"
            $expected = $parent.ExecutablePath -eq $node -and $parent.CommandLine.Replace('/','\') -like ('*'+$Script.Replace('/','\')+'*')
        }
        if ($proc.ExecutablePath -ne $node -or !$expected) { throw "Port $Port is occupied by a different application." }
        return
    }
    $p = Start-Process -FilePath $node -ArgumentList ('"'+$Script+'"') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $lab "$Name-stdout.log") -RedirectStandardError (Join-Path $lab "$Name-stderr.log")
    if($env:DR_1105_CPU_BUDGET){
        # Task Scheduler owns the supervisor's job; attach its child instead.
        try{& (Join-Path $lab 'repo/deploy/windows-server/Set-ProcessCpuBudget.ps1') -Percent ([int]$env:DR_1105_CPU_BUDGET) -Name 'Global\DauntlessUnbrokenEU1Cpu' -ProcessIds @($p.Id) | Out-Null}
        catch{Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue;throw}
    }
    Set-Content -LiteralPath (Join-Path $lab "$Name-manager.pid") -Value $p.Id
    for ($n=0;$n -lt 30;$n++) {
        if (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object RemotePort -eq 0) { return }
        if ($p.HasExited) { throw "$Name stopped. See $Name-stderr.log." }
        Start-Sleep -Milliseconds 500
    }
    throw "$Name did not start. See its logs."
}
if($hosted.retiredWorkerBridge){Start-LabNode 'retired-worker' (Join-Path $PSScriptRoot 'retired-worker.cjs') 61001}
if($env:DR_1105_WORKER -ne '1'){Start-LabNode 'realm-backend' (Join-Path $PSScriptRoot 'start-backend.cjs') 62000}
Start-LabNode 'realm-allocator' (Join-Path $PSScriptRoot 'local-deploy.cjs') 62001
if($env:DR_1105_WORKER -ne '1'){
Start-LabNode 'realm-proxy' (Join-Path $PSScriptRoot 'realm-proxy.cjs') 62002
$env:DASHBOARD_OWNER_KEY_FILE = Join-Path $lab 'backend-state\realm-owner.key'
$env:DASHBOARD_BACKEND = 'http://127.0.0.1:62000'
$env:DASHBOARD_PORT = '62110'
$env:DASHBOARD_SERVER_CONFIG = Join-Path $lab 'backend-state\realm-config.json'
Start-LabNode 'realm-dashboard' (Join-Path $lab 'repo\tools\dashboard.mjs') 62110
}
if($NoWorlds){return}
foreach ($world in @('ramsgate','dojo')) {
    $port = if ($world -eq 'dojo') {63871} else {63870}
    if (!(Get-NetUDPEndpoint -LocalPort $port -ErrorAction SilentlyContinue)) {
        & (Join-Path $PSScriptRoot 'start-server.ps1') -World $world -BindIp $ip
    }
}
Write-Output "Dauntless Unbroken 1.10.5 host ready: $($env:DR_1105_PUBLIC_HOST)"
if (!$NoBrowser -and $env:DR_1105_WORKER -ne '1') { Start-Process 'http://127.0.0.1:62110' }
