// Shared by request diagnostics and the backend logger. Mask incomplete JWTs too:
// optional, dot-separated suffixes cannot make a failed match rescan a long header.
export function Redact(Text: string){
    return Text.replace(/eyJ[A-Za-z0-9_-]*(?:\.[A-Za-z0-9_-]+){0,2}/g, "<token>")
        .replace(/UUK_[A-Za-z0-9_-]{8,}/g, "<redacted>")
        .replace(/[\w-]{64,}/g, "<redacted>");
}

