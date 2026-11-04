import { RemoveTestDb } from './setup';
import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { GetDb } from '../src/db';
import { MakePlayer } from './helpers';
import { DeleteBounties, GetBountyReply, QuarantinedChallenge, SetBounties } from '../src/controllers/bounties';

after(() => RemoveTestDb(() => GetDb().$client.close()));

it('restores supported bounties without destroying quarantined migration progress', async () => {
    const {UserId} = await MakePlayer();
    const old = 'Bounty_Bronze_PatrolAxeTwo';
    const rock = `${QuarantinedChallenge}-season17-7`;
    const valid = 'Bounty_Silver_KillAxePike';
    const rows = [old, rock, valid].map((id, i) => ({bounty_id:id, slot_index:i === 2 ? 0 : i,
        update_version:1, claimed:false, objectives:[{objective_id:id, progress:2}]}));
    // Seed exactly what an import can contain, including two IDs sharing a slot.
    const db = GetDb().$client;
    for (const row of rows) db.prepare('INSERT INTO bounties (accountId,bountyId,slotIndex,updateVersion,data,updatedDate) VALUES (?,?,?,?,?,?)')
        .run(UserId,row.bounty_id,row.slot_index,1,JSON.stringify(row),'2026-11-03T00:00:00Z');
    const draft = {current_draft_choices:[old,valid],previous_draft_selections:[old,valid],bronze_count:2,silver_count:1,gold_count:0};
    db.prepare('INSERT INTO bountydraft (accountId,data,updatedDate) VALUES (?,?,?)').run(UserId,JSON.stringify(draft),'2026-11-03T00:00:00Z');
    const originals = () => db.prepare('SELECT bountyId,data FROM bounties WHERE accountId=? AND bountyId IN (?,?) ORDER BY bountyId').all(UserId,old,rock);
    const before = originals();
    assert.equal(GetBountyReply(UserId).payload.bounties.length,3);
    process.env.BIND_HOST='127.0.0.1'; process.env.LOCAL_1105_REALM='1';
    try {
        const board = GetBountyReply(UserId).payload;
        assert.deepEqual(board.bounties.map((b:any)=>b.bounty_id),[valid]);
        assert.equal(board.bounties[0].objectives[0].progress,2);
        assert.deepEqual(board.draft_data,{...draft,current_draft_choices:[valid],previous_draft_selections:[valid]});
        assert.equal((db.prepare('SELECT data FROM bountydraft WHERE accountId=?').get(UserId) as any).data,JSON.stringify(draft));
        const update = SetBounties(UserId,{bounties:[{...rows[0],update_version:99},{...rows[1],update_version:99},
            {bounty_id:'Bounty_Gold_HuntsSwordTwo',slot_index:0,update_version:1}]},'gameserver');
        assert.equal(update.Status,200);
        assert.deepEqual((update.Body as any).payload.bounties.map((b:any)=>b.bounty_id),['Bounty_Gold_HuntsSwordTwo']);
        const removal = DeleteBounties(UserId,{bounty_ids:[old,rock,'Bounty_Gold_HuntsSwordTwo']},'gameserver');
        assert.deepEqual((removal.Body as any).payload.bounties,[]);
        assert.deepEqual(originals(),before);
        SetBounties(UserId,{bounties:[{bounty_id:QuarantinedChallenge,slot_index:7}]},'gameserver');
        assert.equal(GetBountyReply(UserId).payload.bounties.length,0);
    } finally { delete process.env.LOCAL_1105_REALM; delete process.env.BIND_HOST; }
    assert.equal(GetBountyReply(UserId).payload.bounties.length,2);
});

it('hides malformed imported bounty JSON without changing the preserved rows', async () => {
    const {UserId} = await MakePlayer();
    const db = GetDb().$client;
    db.prepare('INSERT INTO bounties (accountId,bountyId,slotIndex,updateVersion,data,updatedDate) VALUES (?,?,?,?,?,?)')
        .run(UserId, 'Bounty_Bronze_ASInterrupts', 0, 1, '{not-json', '2026-11-03T00:00:00Z');
    db.prepare('INSERT INTO bountydraft (accountId,data,updatedDate) VALUES (?,?,?)')
        .run(UserId, '{not-json', '2026-11-03T00:00:00Z');

    process.env.BIND_HOST='127.0.0.1'; process.env.LOCAL_1105_REALM='1';
    try {
        const board = GetBountyReply(UserId).payload;
        assert.deepEqual(board.bounties, []);
        assert.deepEqual(board.draft_data, {
            current_draft_choices: [], previous_draft_selections: [],
            bronze_count: 0, silver_count: 0, gold_count: 0
        });
    } finally { delete process.env.LOCAL_1105_REALM; delete process.env.BIND_HOST; }

    assert.equal((db.prepare('SELECT data FROM bounties WHERE accountId=?').get(UserId) as any).data, '{not-json');
    assert.equal((db.prepare('SELECT data FROM bountydraft WHERE accountId=?').get(UserId) as any).data, '{not-json');
});
