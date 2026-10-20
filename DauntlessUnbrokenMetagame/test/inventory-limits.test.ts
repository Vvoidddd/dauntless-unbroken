import { RemoveTestDb } from './setup';
import { after, it } from 'node:test';
import assert from 'node:assert/strict';
import { GetDb } from '../src/db';
import { ApplyStackedChanges, BOUNTY_TOKENS_DAILY, ParseStackQuantity, RunInventoryTransaction } from '../src/controllers/inventory';
import { Count, MakePlayer, StackQuantity } from './helpers';

after(() => RemoveTestDb(() => GetDb().$client.close()));
const MAX = 2147483647; // The native inventory's signed 32-bit quantity.
const Stack = (quantity: number, catalogId = 'CURRENCY_NOTES') => ({catalogId, quantity});

it('rejects a quantity outside the native integer range', () => {
    assert.equal(ParseStackQuantity(Stack(MAX), 'add'), MAX);
    for (const quantity of [MAX + 1, Number.MAX_SAFE_INTEGER]) {
        assert.throws(() => ParseStackQuantity(Stack(quantity), 'add'), /quantity/);
    }
});

it('rejects combined stack overflow before changing any inventory', () => {
    for (const added of [[Stack(1)], [Stack(MAX), Stack(1)]]) {
        const stacks = [Stack(MAX), Stack(3, 'ORB')];
        assert.throws(() => ApplyStackedChanges(stacks, [Stack(1, 'ORB')], added, true), /quantity/);
        assert.deepEqual(stacks, [Stack(MAX), Stack(3, 'ORB')]);
    }
});

it('accepts an exchange at the limit when its final balance fits', () => {
    const stacks = [Stack(MAX)];
    ApplyStackedChanges(stacks, [Stack(5)], [Stack(5)], true);
    assert.deepEqual(stacks, [Stack(MAX)]);
});

it('rolls back the whole transaction and ledger on stack overflow', async () => {
    const {UserId, CharacterId} = await MakePlayer();
    const apply = (id: string, items: ReturnType<typeof Stack>[]) => RunInventoryTransaction(
        UserId, CharacterId, id, [], items, [], [], [], {Caller:'gameserver'});
    assert.equal((await apply('limit-seed', [Stack(MAX)])).success, true);
    const logs = Count('inventorylog', 'characterId = ?', CharacterId);
    assert.equal((await apply('limit-overflow', [Stack(1, 'ORB'), Stack(1)])).success, false);
    assert.equal(StackQuantity(CharacterId, 'CURRENCY_NOTES'), MAX);
    assert.equal(StackQuantity(CharacterId, 'ORB'), 0);
    assert.equal(Count('inventorylog', 'characterId = ?', CharacterId), logs);
    assert.equal(Count('inventorytransactions', 'characterId = ?', CharacterId), 1);
});

it('a repeated daily token item in one native batch tops up only once', async () => {
    const {UserId, CharacterId} = await MakePlayer();
    const result = await RunInventoryTransaction(UserId, CharacterId, 'daily-repeat', [],
        [Stack(4, 'TOKEN_BOUNTY_DRAFT'), Stack(4, 'TOKEN_BOUNTY_DRAFT')], [], [], [],
        {Caller:'gameserver', Source:'UBountyComponent::DailyGrant'});
    assert.equal(result.success, true);
    assert.equal(StackQuantity(CharacterId, 'TOKEN_BOUNTY_DRAFT'), BOUNTY_TOKENS_DAILY);
});
