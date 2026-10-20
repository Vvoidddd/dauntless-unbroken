// Configured account IDs, never client-supplied names, roles or request flags.
export function HasServerPriority(userId: string): boolean {
    return userId.length > 0 && (process.env.SERVER_PRIORITY_ACCOUNTS ?? '').split(',').some(id => id.trim() === userId);
}
