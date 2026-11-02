$ErrorActionPreference='Stop'
$lab=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
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
