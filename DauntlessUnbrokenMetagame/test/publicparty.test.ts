import { RemoveTestDb } from './setup';
import './matchmakingenv';
import { after, afterEach, before, beforeEach, it } from 'node:test';
import assert from 'node:assert/strict';
import { GetDb } from '../src/db';
import { users } from '../src/db/schema';
import { HandlePlayerMatchmaking, CheckAndUpdateQueueStatus, CancelMatchmaking, ResetMatchmakingForTests } from '../src/controllers/matchmaking';
import { PollParty, InviteToParty, AcceptPartyInvite, ResetPartiesForTests, SetPartyClockForTests } from '../src/controllers/party';

const ids = ['A','B','C','D','E'].map(x => `UID-public-party-${x}`);
const [A,B,C,D,E] = ids;
const hunt = 'ShatteredIsles_IslandA';
const originalFetch = globalThis.fetch;
const oldHost = process.env.BIND_HOST, oldRealm = process.env.LOCAL_1105_REALM;
let now = 0, calls: any[] = [], capacity = false;
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
async function party(leader: string, member: string) {
    const p = await PollParty(leader) as any;
    await PollParty(member);
    assert.equal(InviteToParty(leader, member, p.partyId).Status, 200);
    assert.equal((await AcceptPartyInvite(member, p.partyId)).Status, 200);
}
async function join(id: string, privateHunt = false, target = hunt) {
    assert.equal(await HandlePlayerMatchmaking('SHARED', '', target, id, privateHunt), true);
}
async function launch(...players: string[]) {
    await flush();
    now += 5001;
    for (const id of players) await CheckAndUpdateQueueStatus(id);
    await flush();
}
before(() => {
    process.env.BIND_HOST = '127.0.0.1'; process.env.LOCAL_1105_REALM = '1';
    for (const userId of ids) GetDb().insert(users).values({userId, name:userId, notes:0}).run();
});
beforeEach(() => {
    ResetMatchmakingForTests(); ResetPartiesForTests();
    now = Date.parse('2026-11-03T12:00:00Z'); calls = []; capacity = false;
    SetPartyClockForTests(() => now);
    globalThis.fetch = (async (_url: any, init: RequestInit = {}) => {
        let body: any = {servers:[], complete:false};
        if (init.method === 'POST') {
            calls.push(JSON.parse(String(init.body)));
            body = capacity ? {error:'capacity_unavailable', reason:'hunts'} : {host:'127.0.0.1', port:8800+calls.length};
        }
        return new Response(JSON.stringify(body), {status: capacity && init.method === 'POST' ? 503 : 200});
    }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = originalFetch; ResetMatchmakingForTests(); ResetPartiesForTests(); SetPartyClockForTests(); });
after(() => {
    if (oldHost === undefined) delete process.env.BIND_HOST; else process.env.BIND_HOST = oldHost;
    if (oldRealm === undefined) delete process.env.LOCAL_1105_REALM; else process.env.LOCAL_1105_REALM = oldRealm;
    RemoveTestDb(() => GetDb().$client.close());
});

it('public parties and solo searchers share one allocation and endpoint', async () => {
    await party(A,B); await join(A); await join(C); await join(D); await flush();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].ExpectedPlayers, [A,B,C,D]);
    for (const id of [A,B,C,D]) {
        const entry = await CheckAndUpdateQueueStatus(id);
        assert.equal(entry?.Ready, true); assert.equal(entry?.Port, 8801);
    }
});
it('two public parties share a hunt without becoming one party', async () => {
    await party(A,B); await party(C,D); await join(A); await join(C); await flush();
    assert.deepEqual(calls.map(c => c.ExpectedPlayers), [[A,B,C,D]]);
    assert.notEqual((await CheckAndUpdateQueueStatus(A))?.CandidateId, (await CheckAndUpdateQueueStatus(C))?.CandidateId);
});
it('a party that does not fit is never split across hunts', async () => {
    await party(D,E); await join(A); await join(B); await join(C); await join(D);
    await launch(A,D);
    assert.deepEqual(calls.map(c => c.ExpectedPlayers), [[A,B,C],[D,E]]);
});
it('private solo and private party hunts exclude public searchers', async () => {
    await party(A,B); await join(C); await join(A,true); await join(D,true); await launch(C);
    assert.deepEqual(calls.map(c => c.ExpectedPlayers), [[A,B],[D],[C]]);
    assert.equal(calls[0].Private, true); assert.equal(calls[1].Private, true);
    assert.equal(calls[2].Private, undefined);
});
it('different hunts stay separate and cancelling a party preserves public solo searchers', async () => {
    await party(A,B); await join(A); await join(C); await join(D,false,'ShatteredIsles_IslandB');
    CancelMatchmaking(A); await launch(C,D);
    assert.deepEqual(calls.map(c => c.ExpectedPlayers), [[C],[D]]);
    assert.equal(await CheckAndUpdateQueueStatus(B), undefined);
});
it('switching a queued public party to private removes it from the public pool', async () => {
    await party(A,B); await join(A); await join(C); await join(A,true); await launch(C);
    assert.deepEqual(calls.map(c => c.ExpectedPlayers), [[A,B],[C]]);
    assert.equal(calls[0].Private, true);
});
it('startup retries retain the submitted mixed roster and later joiners use a new hunt', async () => {
    await party(A,B); await join(A); await join(C); capacity = true; await launch(A);
    assert.deepEqual(calls[0].ExpectedPlayers, [A,B,C]);
    await join(D); capacity = false; await launch(A,D);
    assert.deepEqual(calls.map(c => c.ExpectedPlayers), [[A,B,C],[A,B,C],[D]]);
    for (const id of [A,B,C]) assert.equal((await CheckAndUpdateQueueStatus(id))?.Port, 8802);
    assert.equal((await CheckAndUpdateQueueStatus(D))?.Port, 8803);
});
