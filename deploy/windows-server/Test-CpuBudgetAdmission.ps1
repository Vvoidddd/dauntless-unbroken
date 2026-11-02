$ErrorActionPreference='Stop'
. "$PSScriptRoot/CpuBudgetAdmission.ps1"
$dir=Join-Path ([IO.Path]::GetTempPath()) ('cpu-admission-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($dir)
$flag=Join-Path $dir 'drain.flag'
try{
 if(Update-CpuBudgetAdmission $flag 56 60){throw 'Admitted load drained'}
 if(!(Update-CpuBudgetAdmission $flag 57 60)){throw 'Budget did not drain'}
 if(!(Update-CpuBudgetAdmission $flag 54 60)){throw 'Hysteresis failed'}
 if(Update-CpuBudgetAdmission $flag 51 60){throw 'Did not resume'}
 [IO.File]::WriteAllText($flag,'manual maintenance')
 if(!(Update-CpuBudgetAdmission $flag 10 60)){throw 'Manual drain removed'}
 if([IO.File]::ReadAllText($flag) -ne 'manual maintenance'){throw 'Manual drain overwritten'}
 'PASS: cap admission, resume hysteresis, manual drain preserved'
}finally{
 if(Test-Path -LiteralPath $flag){Remove-Item -LiteralPath $flag -Force}
 Remove-Item -LiteralPath $dir
}
