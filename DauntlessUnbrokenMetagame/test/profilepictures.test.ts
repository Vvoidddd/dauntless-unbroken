import './setup';
import './authenv';
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {GetDb} from '../src/db';
import {users} from '../src/db/schema';
import {
    ApproveProfilePicture,
    GetApprovedProfilePicture,
    GetProfilePictureStatus,
    ListProfilePictureModeration,
    ProfilePictureModerationMode,
    RejectProfilePicture,
    SubmitProfilePicture
} from '../src/controllers/profilepictures';
import {RemoveTestDb} from './setup';

const png32 = 'data:image/png;base64,' + Buffer.concat([
    Buffer.from('\x89PNG\r\n\x1a\n', 'binary'),
    Buffer.from([0,0,0,13]), Buffer.from('IHDR'),
    Buffer.from([0,0,0,32,0,0,0,32,8,6,0,0,0]),
    Buffer.alloc(4),
]).toString('base64');

after(() => RemoveTestDb(() => GetDb().$client.close()));

test('profile picture moderation defaults to the local automatic classifier', () => {
    const previous = process.env.PROFILE_PICTURE_MODERATION;
    delete process.env.PROFILE_PICTURE_MODERATION;
    assert.equal(ProfilePictureModerationMode(), 'nsfwjs');
    if(previous === undefined) delete process.env.PROFILE_PICTURE_MODERATION;
    else process.env.PROFILE_PICTURE_MODERATION = previous;
});

test('profile pictures remain private until moderation approves them', async () => {
    process.env.PROFILE_PICTURE_MODERATION = 'manual';
    const db = GetDb();
    db.insert(users).values({userId: 'UID-pfp', name: 'PfpTest', notes: 0}).run();
    const directory = path.join(path.dirname(process.env.DB_FILENAME!), 'profile-pictures');
    process.env.PROFILE_PICTURE_DIR = directory;

    const pending = await SubmitProfilePicture('UID-pfp', png32);
    assert.equal(pending.status, 'pending');
    assert.equal(GetApprovedProfilePicture('UID-pfp'), null);
    assert.equal(GetProfilePictureStatus('UID-pfp')?.status, 'pending');
    assert.equal(ListProfilePictureModeration('pending').rows[0]?.accountId, 'UID-pfp');

    const approved = await ApproveProfilePicture(pending.id, 'UID-moderator');
    assert.equal(approved.status, 'approved');
    const publicImage = GetApprovedProfilePicture('UID-pfp');
    assert.ok(publicImage);
    assert.equal(publicImage.mimeType, 'image/png');
    assert.equal(fs.existsSync(publicImage.filePath), true);

    const replacement = await SubmitProfilePicture('UID-pfp', png32);
    assert.equal(replacement.status, 'pending');
    await RejectProfilePicture(replacement.id, 'UID-moderator', 'Not suitable');
    assert.equal(GetProfilePictureStatus('UID-pfp')?.status, 'rejected');
    assert.ok(GetApprovedProfilePicture('UID-pfp'));
});

test('profile picture validation rejects oversized and non-image data', async () => {
    await assert.rejects(() => SubmitProfilePicture('UID-pfp', 'data:text/plain;base64,SGVsbG8='), /invalid_image/);
    await assert.rejects(() => SubmitProfilePicture('UID-pfp', 'data:image/png;base64,' + Buffer.alloc(101 * 1024).toString('base64')), /image_too_large/);
});

