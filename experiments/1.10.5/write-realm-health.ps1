$ErrorActionPreference = 'Stop'
$lab = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$hosted = Get-Content -LiteralPath (Join-Path $lab 'backend-state/hosted.json') -Raw | ConvertFrom-Json
$worker = $hosted.role -eq 'worker'
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Select-Object -ExpandProperty LocalPort)
$checks = [ordered]@{}
foreach ($probe in @(@('Realm allocator',62001,'gameservers'),@('Realm backend',62000,'dauntless-status'))) {
    try {
        $data = Invoke-RestMethod -Uri "http://127.0.0.1:$($probe[1])/$($probe[2])" -TimeoutSec 5
        $checks[$probe[0]] = if ($probe[1] -eq 62001) { $null -ne $data.servers } else { $data.version -is [string] -and $data.name -is [string] }
    } catch { $checks[$probe[0]] = $false }
}
$checks['Realm game access'] = $listeners -contains $(if ($worker) {443} else {62002})
$checks['Realm dashboard'] = $listeners -contains $(if ($worker) {61110} else {62110})
$health = @{
    kind = 'realm-supervisor'; at = [DateTime]::UtcNow.ToString('o')
    errors = @($checks.Values | Where-Object { !$_ }).Count
    tasks = @($checks.GetEnumerator() | ForEach-Object { @{name=$_.Key;state=$(if ($_.Value) {'Running'} else {'Unavailable'})} })
}
$file = Join-Path $lab 'backend-state/realm-health.json'
[IO.File]::WriteAllText("$file.tmp",($health | ConvertTo-Json -Depth 4),(New-Object Text.UTF8Encoding($false)))
Move-Item -LiteralPath "$file.tmp" -Destination $file -Force
