const ACCOUNT_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function MaintenanceActive(): boolean {
    return process.env.MAINTENANCE_MODE !== undefined && process.env.MAINTENANCE_MODE !== '0';
}

export function MaintenanceAllows(userId: unknown): boolean {
    const mode = process.env.MAINTENANCE_MODE;
    if(mode === undefined || mode === '0') return true;
    if(mode !== '1' || typeof userId !== 'string') return false;
    const raw = process.env.MAINTENANCE_ALLOWED_ACCOUNT_IDS;
    if(typeof raw !== 'string' || raw.length === 0) return false;
    const ids = raw.split(',').map(id => id.trim());
    if(ids.some(id => !ACCOUNT_ID.test(id)) || new Set(ids).size !== ids.length) return false;
    return ids.includes(userId);
}
