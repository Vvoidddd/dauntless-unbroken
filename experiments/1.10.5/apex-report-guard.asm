EXTERN ApexReportContinue:QWORD
EXTERN ApexReportNext:QWORD
EXTERN ApexEarlyContinue:QWORD
.code
ApexReportGuardEarly PROC
    cmp qword ptr [rbx], 0
    je removed_early_report
    jmp qword ptr [ApexEarlyContinue]
removed_early_report:
    inc edi
    jmp qword ptr [ApexReportNext]
ApexReportGuardEarly ENDP
ApexReportGuard PROC
    cmp qword ptr [rbx], 0
    je removed_report
    jmp qword ptr [ApexReportContinue]
removed_report:
    inc edi
    jmp qword ptr [ApexReportNext]
ApexReportGuard ENDP
END
