import { GetDb } from '../db';
import { HuntRegion, SetRegionReader } from './huntregion';

export function GetHuntRegion(userId: string): HuntRegion {
    const row = GetDb().$client.prepare('SELECT region FROM huntregions WHERE userId = ?').get(userId) as {region:string} | undefined;
    // A saved AUS choice outlives the AUS host. With the region off, those hunts could only ever be refused
    // Compatibility for saved preferences; no retired host is contacted.
    const region = row?.region === 'aus' ? 'us' : row?.region;
    // Preferences survive fleet changes. Route disabled regions to the shared EU
    // pool rather than leaving those players waiting on a host we do not run.
    if (region === 'us' && process.env.US_REGION === '1') return 'us';
    if (region === 'ger' && process.env.GERMANY_REGION === '1') return 'ger';
    return 'main';
}
export function SaveHuntRegion(userId: string, region: HuntRegion) {
    GetDb().$client.prepare('INSERT INTO huntregions (userId, region) VALUES (?, ?) ON CONFLICT(userId) DO UPDATE SET region = excluded.region').run(userId, region);
}
SetRegionReader(GetHuntRegion);
