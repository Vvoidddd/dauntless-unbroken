import { RemoveTestDb } from './setup';
import './authenv';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Call, StartApp, StopApp } from './appclient';
import { GetDb } from '../src/db';

before(StartApp);
after(async () => { await StopApp(); RemoveTestDb(() => GetDb().$client.close()); });

test('1.10.5 Update Notes use the native payload and stay limited to the matching build', async () => {
    const url = '/patchnotes/en/365075_rel-1.10.5_shipping';
    const oldAccount = process.env.LOCAL_1105_ACCOUNT_ID;
    const oldBind = process.env.BIND_HOST;
    try {
        delete process.env.LOCAL_1105_ACCOUNT_ID;
        process.env.BIND_HOST = '127.0.0.1';
        assert.equal((await Call('GET', url)).status, 404);
        process.env.LOCAL_1105_ACCOUNT_ID = 'UID-local-test';
        process.env.BIND_HOST = '0.0.0.0';
        assert.equal((await Call('GET', url)).status, 404);
        process.env.BIND_HOST = '127.0.0.1';
        assert.equal((await Call('GET', '/patchnotes/en/other-build')).status, 404);
        const reply = await Call('GET', url);
        assert.equal(reply.status, 200);
        assert.equal(reply.json.code, '');
        assert.equal(reply.json.message, 'OK');
        const notes = reply.json.payload;
        assert.equal(notes.title, 'Dauntless Unbroken');
        assert.equal(notes.release_version, '1.10.5 - Public Release');
        assert.ok(Number.isFinite(Date.parse(notes.date)));
        assert.equal(notes.notes.length, 4);
        for (const category of notes.notes) {
            assert.equal(typeof category.type, 'string');
            assert.ok(category.title.length > 0);
            assert.ok(category.sections.length > 0);
            for (const section of category.sections) {
                for (const key of ['type', 'title', 'description', 'background', 'cta', 'url']) {
                    assert.equal(typeof section[key], 'string');
                }
                for (const change of section.changes) {
                    assert.equal(typeof change.comment, 'string');
                    assert.ok(change.list.every((item: unknown) => typeof item === 'string' && item.length > 0));
                }
            }
        }
        // The English content is an explicit fallback, not a claimed translation.
        assert.deepEqual((await Call('GET', url.replace('/en/', '/de/'))).json, reply.json);
    } finally {
        if (oldAccount === undefined) delete process.env.LOCAL_1105_ACCOUNT_ID;
        else process.env.LOCAL_1105_ACCOUNT_ID = oldAccount;
        if (oldBind === undefined) delete process.env.BIND_HOST;
        else process.env.BIND_HOST = oldBind;
    }
});
