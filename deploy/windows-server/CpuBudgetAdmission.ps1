# Manage only our own flag; an operator's manual drain always wins.
function Update-CpuBudgetAdmission([string]$Path,[double]$Usage,[int]$Budget) {
    if([double]::IsNaN($Usage) -or [double]::IsInfinity($Usage) -or $Usage -lt 0 -or $Budget -lt 1 -or $Budget -gt 100){throw 'Invalid CPU admission sample'}
    $marker='Dauntless CPU budget admission'
    if($Usage -ge $Budget*0.95 -and !(Test-Path -LiteralPath $Path)){
        try {
            $f=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
            try{$b=[Text.Encoding]::UTF8.GetBytes($marker);$f.Write($b,0,$b.Length)}finally{$f.Dispose()}
        }catch [IO.IOException]{if(!(Test-Path -LiteralPath $Path)){throw}}
    }elseif($Usage -le $Budget*0.85 -and (Test-Path -LiteralPath $Path)){
        if([IO.File]::ReadAllText($Path) -eq $marker){Remove-Item -LiteralPath $Path -Force}
    }
    return (Test-Path -LiteralPath $Path)
}
