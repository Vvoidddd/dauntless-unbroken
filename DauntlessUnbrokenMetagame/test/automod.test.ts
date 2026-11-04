import './setup';
import './authenv';
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {GetDb} from '../src/db';
import {IsUsernameAutomaticallyBlocked, IsValidUsername, RegisterAccount} from '../src/controllers/accounts';
import {RemoveTestDb} from './setup';

after(() => RemoveTestDb(() => GetDb().$client.close()));

test('username automod blocks reserved and configured names', () => {
    assert.equal(IsUsernameAutomaticallyBlocked('admin'), true);
    assert.equal(IsUsernameAutomaticallyBlocked('support'), true);
    process.env.USERNAME_AUTOMOD_BLOCKLIST = 'badword,spoof';
    assert.equal(IsUsernameAutomaticallyBlocked('badword'), true);
    assert.equal(IsUsernameAutomaticallyBlocked('BadWord_2'), true);
    assert.equal(IsUsernameAutomaticallyBlocked('Slayer_22'), false);
    delete process.env.USERNAME_AUTOMOD_BLOCKLIST;
});

test('registration reports an automatic username moderation rejection', () => {
    assert.equal(IsValidUsername('admin'), true);
    const result = RegisterAccount('OPEN', 'admin', '');
    assert.deepEqual(result, {ok: false, Status: 400, Error: 'username_moderated'});
});
