$ErrorActionPreference='Stop'
. "$PSScriptRoot/Run-FleetWatchdog.ps1" -Root $env:TEMP
$spans=@{};$now=[datetime]::UtcNow
function Check($value){if(!$value){throw 'Watchdog regression failed'}}
Check (!(Test-EmptyInterval $spans 'hunt:1' 0 $now))
foreach($s in 30,60,90){Check (!(Test-EmptyInterval $spans 'hunt:1' 0 $now.AddSeconds($s)))}
Check (Test-EmptyInterval $spans 'hunt:1' 0 $now.AddSeconds(120))
Check (!(Test-EmptyInterval $spans 'hunt:1' 1 $now.AddSeconds(121)))
Check (!$spans.ContainsKey('hunt:1'))
Check (!(Test-EmptyInterval $spans 'hunt:1' 0 $now.AddSeconds(130)))
Check (!(Test-EmptyInterval $spans 'hunt:1' $null $now.AddSeconds(140)))
Check (!$spans.ContainsKey('hunt:1'))
Check (!(Test-EmptyInterval $spans 'hunt:1' 0 $now.AddSeconds(150)))
Check (!(Test-EmptyInterval $spans 'hunt:1' 0 $now.AddSeconds(250)))
Check (!(Test-EmptyInterval $spans 'hunt:2' 0 $now.AddSeconds(270)))
Check (!(Test-EmptyInterval $spans 'hunt:1' 0 $now.AddSeconds(200)))
$file=Join-Path $env:TEMP "watchdog-test-$([guid]::NewGuid()).log"
try{
    [IO.File]::WriteAllText($file,"net driver=IpNetDriver_123 connections=0 owned=0 open=0`n")
    Check ((Read-EmptyCount $file $now.AddSeconds(-5) ([datetime]::UtcNow)) -ceq 0)
    [IO.File]::WriteAllText($file,"net driver=IpNetDriver_123 connections=0 owned=0 open=1`n")
    Check ($null -eq (Read-EmptyCount $file $now.AddSeconds(-5) ([datetime]::UtcNow)))
    [IO.File]::WriteAllText($file,"net driver=IpNetDriver_123 connections=1 owned=0 open=0`n")
    Check ((Read-EmptyCount $file $now.AddSeconds(-5) ([datetime]::UtcNow)) -ceq 1)
    Check ($null -eq (Read-EmptyCount $file $now.AddMinutes(1) $now))
    (Get-Item $file).LastWriteTimeUtc=$now.AddMinutes(-2)
    Check ($null -eq (Read-EmptyCount $file $now.AddMinutes(-3) $now))
    (Get-Item $file).LastWriteTimeUtc=$now.AddMinutes(1)
    Check ($null -eq (Read-EmptyCount $file $now.AddMinutes(-3) $now))
}finally{Remove-Item -LiteralPath $file -Force}
'Fleet watchdog regressions passed'
