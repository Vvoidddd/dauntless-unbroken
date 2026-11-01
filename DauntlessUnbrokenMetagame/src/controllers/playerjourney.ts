import { eq } from 'drizzle-orm';
import { isDeepStrictEqual } from 'node:util';
import { GetDb } from '../db';
import { playerjourney } from '../db/schema';
import { IsPlainObject } from './progressionevents';

type Journey = {nodes: Record<string, {node_id: string, node_status: number,
    objectives: {online_objective_id: string, objective_amount: number, objective_status: number}[]}>, update_version: number};
const UInt32 = (n: unknown): n is number => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 0xffffffff;
const Id = (s: unknown): s is string => typeof s === 'string' && s.length > 0 && s.length <= 256 && !['__proto__','constructor','prototype'].includes(s);

function ValidJourney(body: unknown): body is Journey {
    if (!IsPlainObject(body) || !UInt32(body.update_version) || !IsPlainObject(body.nodes) || Object.keys(body.nodes).length > 4096) return false;
    return Object.entries(body.nodes).every(([id, node]) => {
        if (!Id(id) || !IsPlainObject(node) || node.node_id !== id || ![0,1,2].includes(node.node_status as number) ||
            !Array.isArray(node.objectives) || node.objectives.length > 256) return false;
        const ids = new Set<string>();
        return node.objectives.every(o => {
            if (!IsPlainObject(o) || !Id(o.online_objective_id) || ids.has(o.online_objective_id) ||
                !UInt32(o.objective_amount) || ![0,1,2].includes(o.objective_status as number)) return false;
            ids.add(o.online_objective_id); return true;
        });
    });
}

export function GetPlayerJourney(accountId: string): Journey {
    const row = GetDb().select().from(playerjourney).where(eq(playerjourney.accountId, accountId)).get();
    return row ? {nodes: JSON.parse(row.nodes), update_version: row.updateVersion} : {nodes: {}, update_version: 0};
}

// Build 365075 posts the complete snapshot, incrementing its version before send.
// Immediate transport failures can skip versions; identical retries are safe.
export function SavePlayerJourney(accountId: string, body: unknown): 200 | 400 | 409 {
    if (!ValidJourney(body)) return 400;
    return GetDb().transaction(tx => {
        const row = tx.select().from(playerjourney).where(eq(playerjourney.accountId, accountId)).get();
        if (row && body.update_version <= row.updateVersion) {
            return body.update_version === row.updateVersion && isDeepStrictEqual(body.nodes, JSON.parse(row.nodes)) ? 200 : 409;
        }
        // A partial/uninitialized snapshot must never erase previously saved nodes.
        if (row && Object.keys(JSON.parse(row.nodes)).some(id => !Object.hasOwn(body.nodes, id))) return 409;
        tx.insert(playerjourney).values({accountId, nodes: JSON.stringify(body.nodes), updateVersion: body.update_version})
            .onConflictDoUpdate({target: playerjourney.accountId,
                set: {nodes: JSON.stringify(body.nodes), updateVersion: body.update_version}}).run();
        return 200;
    });
}
