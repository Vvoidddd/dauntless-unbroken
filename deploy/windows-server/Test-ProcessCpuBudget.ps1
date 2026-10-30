$ErrorActionPreference='Stop'
$helper=Join-Path $PSScriptRoot 'Set-ProcessCpuBudget.ps1'
$name='UnbrokenCpuTest-'+[Guid]::NewGuid().ToString('N')
$scratch=Join-Path ([IO.Path]::GetTempPath()) $name
New-Item -ItemType Directory -Path $scratch | Out-Null
$workers=@()
$childId=0
function Start-TestWorker([string]$Code) {
    $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Code))
    Start-Process -FilePath "$PSHOME\powershell.exe" -ArgumentList '-NoProfile','-EncodedCommand',$encoded -WindowStyle Hidden -PassThru
}
try {
    $gate=Join-Path $scratch 'go'
    $childFile=Join-Path $scratch 'child.txt'
    $childCode=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes('Start-Sleep -Seconds 60'))
    $parentCode=@"
while (!(Test-Path -LiteralPath '$gate')) { Start-Sleep -Milliseconds 100 }
`$child=Start-Process -FilePath '$PSHOME\powershell.exe' -ArgumentList '-NoProfile','-EncodedCommand','$childCode' -WindowStyle Hidden -PassThru
`$child.Id | Set-Content -LiteralPath '$childFile'
Start-Sleep -Seconds 60
"@
    $parent=Start-TestWorker $parentCode
    $existing=Start-TestWorker 'Start-Sleep -Seconds 60'
    $outside=Start-TestWorker 'Start-Sleep -Seconds 60'
    $workers=@($parent,$existing,$outside)
    # Attach from a short-lived controller: the named job must survive its exit.
    $setter=Start-TestWorker "& '$helper' -Name '$name' -Percent 60 -ProcessIds @($($parent.Id),$($existing.Id)) | Out-Null"
    $setter.WaitForExit()
    if ($setter.ExitCode -ne 0) { throw 'Initial attachment failed' }
    Set-Content -LiteralPath $gate -Value 'go'
    for ($i=0; $i -lt 100 -and !(Test-Path -LiteralPath $childFile); $i++) { Start-Sleep -Milliseconds 100 }
    $childId=[int](Get-Content -LiteralPath $childFile)
    $ids=@($parent.Id,$existing.Id,$childId)
    $verified=& $helper -Name $name -Percent 60 -ProcessIds $ids -VerifyOnly
    if ($verified.ProcessIds.Count -ne 3) { throw 'Expected existing and inherited processes in shared job' }
    for ($i=0; $i -lt 20; $i++) { & $helper -Name $name -Percent 60 -ProcessIds $ids | Out-Null }
    $rejected=$false
    try { & $helper -Name $name -Percent 60 -ProcessIds @($outside.Id) -VerifyOnly | Out-Null } catch { $rejected=$true }
    if (!$rejected) { throw 'Unrelated process was included' }
    $rejected=$false
    try { & $helper -Name $name -Percent 59 -VerifyOnly | Out-Null } catch { $rejected=$true }
    if (!$rejected) { throw 'Wrong rate was accepted' }
    'PASS: 60% shared hard cap, live attachment, child inheritance, repeat application, unrelated-process exclusion and rate verification'
} finally {
    if ($childId) { Stop-Process -Id $childId -Force -ErrorAction SilentlyContinue }
    $workers | Stop-Process -Force -ErrorAction SilentlyContinue
    # Only files created by this check, inside its unique scratch directory.
    foreach ($file in 'go','child.txt') { Remove-Item -LiteralPath (Join-Path $scratch $file) -Force -ErrorAction SilentlyContinue }
    Remove-Item -LiteralPath $scratch -Force
}
