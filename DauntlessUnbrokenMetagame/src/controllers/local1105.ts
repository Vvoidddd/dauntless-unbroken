import { GetDb } from '../db';
import { GetConfiguredPaths } from './progressionconfig';
import itemKinds from '../vendor/store_item_kinds_1105.json';

// Only exact native cosmetic definitions qualify; weapon/armour prefixes alone include gear.
export function NativeStackedCosmetic(id: string): boolean {
    return /^(AR_|WP_|LT_|EM_|BNC_)/.test(id) && (itemKinds as Record<string,string>)[id] === 'stacked';
}

// Opt-in compatibility mode for the isolated 365075 realm only.
export function Local1105Enabled() {
    return process.env.BIND_HOST === '127.0.0.1' &&
        (process.env.LOCAL_1105_REALM === '1' || !!process.env.LOCAL_1105_ACCOUNT_ID);
}
export function Local1105Account(id: unknown): id is string {
    return Local1105Enabled() && typeof id === 'string' &&
        (process.env.LOCAL_1105_REALM === '1' || id === process.env.LOCAL_1105_ACCOUNT_ID) &&
        !!GetDb().$client.prepare('SELECT 1 FROM users WHERE userId=?').get(id);
}
export function Initialize1105Experience(id: string) {
    if (!Local1105Account(id)) throw new Error('Not a 1.10.5 realm account');
    const paths = GetConfiguredPaths().filter(p => p.progression_id.startsWith('ExperienceTrack_Weapon_'));
    if (paths.length !== 7) throw new Error('The seven 1.10.5 weapon XP tracks must be configured');
    const db = GetDb().$client;
    db.transaction(() => {
        const insert = db.prepare('INSERT INTO progress_tracks (accountId,progressionId,progress,confirmedFreeRank,confirmedPremiumRank,confirmedDate,updatedDate) VALUES (?,?,0,1,0,?,?) ON CONFLICT(accountId,progressionId) DO NOTHING');
        const now = new Date().toISOString();
        for (const p of paths) insert.run(id, p.progression_id, now, now);
    })();
}
