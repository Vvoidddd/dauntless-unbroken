param([switch]$OutsideTaskJob)
$ErrorActionPreference='Stop'
$lab=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
if(!$OutsideTaskJob -and (Get-Content -LiteralPath (Join-Path $lab 'backend-state/hosted.json') -Raw|ConvertFrom-Json).cpuBudget){
 # Task Scheduler's job cannot join the shared CPU-job hierarchy on every restart.
 # WMI starts this supervisor outside that job; children still receive our shared cap.
 while($true){
  $startup=New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ShowWindow=[uint16]0}
  $command='powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$PSCommandPath+'" -OutsideTaskJob'
  $created=Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine=$command;ProcessStartupInformation=$startup}
  if($created.ReturnValue -ne 0){throw "Supervisor launch failed: $($created.ReturnValue)"}
  Set-Content -LiteralPath (Join-Path $lab 'realm-supervisor.pid') -Value $created.ProcessId
  Wait-Process -Id $created.ProcessId -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 5
 }
}
$budget=(Get-Content -LiteralPath (Join-Path $lab 'backend-state/hosted.json') -Raw|ConvertFrom-Json).cpuBudget
if($budget){
 # Attach the long-lived parent before any children acquire their own jobs.
 & (Join-Path $lab 'repo/deploy/windows-server/Set-ProcessCpuBudget.ps1') -Percent ([int]$budget) -Name 'Global\DauntlessUnbroken1105Cpu' | Out-Null
}
while($true){
 try{
  $last=Get-Content -LiteralPath (Join-Path $lab 'downloads/game-download.log') -Tail 1 | ConvertFrom-Json
  if($last.phase -ne 'complete'){
   & (Join-Path $PSScriptRoot 'start-realm.ps1') -NoBrowser -NoWorlds | Out-Null
   throw 'Waiting for the verified game download'
  }
  $loader=Join-Path $lab 'game/Archon/Binaries/Win64/dxgi.dll'
  if(!(Test-Path -LiteralPath $loader)){Copy-Item -LiteralPath (Join-Path $lab 'repo/DauntlessUnbrokenLauncher/assets/dxgi.dll') -Destination $loader}
  & (Join-Path $PSScriptRoot 'start-realm.ps1') -NoBrowser | Out-Null
 }catch{Add-Content -LiteralPath (Join-Path $lab 'host-supervisor.log') -Value "$(Get-Date -Format o) $($_.Exception.Message)"}
 Start-Sleep -Seconds 30
}
