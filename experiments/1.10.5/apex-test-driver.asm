PUBLIC ApexTestCall
PUBLIC ApexTestSite
PUBLIC ApexTestEarlySite
PUBLIC ApexTestNext
PUBLIC ApexRealCall
PUBLIC ApexRealExit
EXTERN ApexRealEntry:QWORD
.code
ApexTestCall PROC
    push rbx
    push rdi
    mov rbx, rcx
    xor edi, edi
ApexTestEarlySite LABEL BYTE
    cmp dword ptr [rbx+2ch], 0
    jbe ApexTestSite
    cmp dword ptr [rbx+28h], 1
    jne ApexTestSite
    mov qword ptr [rbx], 0
ApexTestSite LABEL NEAR
    cmp qword ptr [rbx+68h], 0
    je no_chunks
    mov dword ptr [rbx+2ch], 0
no_chunks:
    mov rax, qword ptr [rbx]
    inc edi
    mov dword ptr [rax+5dch], 0ffffffffh
ApexTestNext LABEL BYTE
    mov eax, edi
    pop rdi
    pop rbx
    ret
ApexTestCall ENDP
ApexRealCall PROC
    push rbp
    push rbx
    push rdi
    push r15
    sub rsp, 28h
    mov rbx, rcx
    mov rbp, rdx
    xor edi, edi
    xor r15d, r15d
    jmp qword ptr [ApexRealEntry]
ApexRealExit LABEL BYTE
    mov eax, edi
    add rsp, 28h
    pop r15
    pop rdi
    pop rbx
    pop rbp
    ret
ApexRealCall ENDP
END
