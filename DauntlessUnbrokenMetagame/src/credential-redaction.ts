// Shared by request diagnostics and the backend logger. Scan each JWT-shaped
// span once, including incomplete tokens, without regex backtracking.
export function Redact(Text: string){
    const parts: string[] = [];
    let cursor = 0;
    for (let start = Text.indexOf("eyJ"); start !== -1; start = Text.indexOf("eyJ", cursor)) {
        let end = start + 3;
        while (end < Text.length && /[A-Za-z0-9_.-]/.test(Text[end])) ++end;
        parts.push(Text.slice(cursor, start), "<token>");
        cursor = end;
    }
    parts.push(Text.slice(cursor));
    return parts.join("")
        .replace(/UUK_[A-Za-z0-9_-]{8,}/g, "<redacted>")
        .replace(/[\w-]{64,}/g, "<redacted>");
}

