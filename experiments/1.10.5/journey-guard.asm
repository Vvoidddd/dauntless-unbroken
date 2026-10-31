; Preserve the callback's shared-pointer destruction and normal failure handling.
EXTERN JourneyContinue:QWORD
EXTERN JourneyFailure:QWORD
EXTERN LocalListen:PROC
EXTERN WorldListenContinue:QWORD
.code
JourneyGuard PROC
    mov rcx, qword ptr [rsi]
    test rcx, rcx
    jz missing_response
    jmp qword ptr [JourneyContinue]
missing_response:
    jmp qword ptr [JourneyFailure]
JourneyGuard ENDP
WorldListenGuard PROC
    call LocalListen
    jmp qword ptr [WorldListenContinue]
WorldListenGuard ENDP
END
