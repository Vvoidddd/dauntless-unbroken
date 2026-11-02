import { RemoveTestDb } from './setup';
import './authenv';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Call, StartApp, StopApp } from './appclient';
import { GetDb } from '../src/db';
import { MakePlayer } from './helpers';
import path from 'node:path';
import { Initialize1105Experience } from '../src/controllers/local1105';

before(StartApp);
after(async () => { await StopApp(); RemoveTestDb(() => GetDb().$client.close()); });

test('Journey snapshots persist, allow skipped versions and retries, and reject resets and unauthorized writes', async () => {
    const {UserId} = await MakePlayer();
    process.env.LOCAL_1105_ACCOUNT_ID = UserId;
    process.env.BIND_HOST = '127.0.0.1';
    const url = '/pjm/' + UserId;
    const snapshot = {update_version: 3, nodes: {start: {node_id: 'start', node_status: 2,
        objectives: [{online_objective_id: 'visit', objective_amount: 1, objective_status: 2}]}}};
    assert.equal((await Call('POST', url, {body: snapshot})).status, 401);
    assert.equal((await Call('POST', url, {as: UserId, body: snapshot})).status, 403);
    assert.equal((await Call('POST', '/pjm/foreign', {gs: true, body: snapshot})).status, 403);
    assert.equal((await Call('POST', url, {gs: true, body: snapshot})).status, 200);
    assert.equal((await Call('POST', url, {gs: true, body: snapshot})).status, 200);
    assert.deepEqual((await Call('GET', '/pjm', {as: UserId})).json.payload, snapshot);
    assert.equal((await Call('POST', url, {gs: true, body: {...snapshot, update_version: 2}})).status, 409);
    assert.equal((await Call('POST', url, {gs: true, body: {nodes: {}, update_version: 4}})).status, 409);
    const invalid = structuredClone(snapshot); invalid.nodes.start.objectives[0].objective_amount = -1;
    assert.equal((await Call('POST', url, {gs: true, body: invalid})).status, 400);
    const conflict = structuredClone(snapshot); conflict.nodes.start.node_status = 0;
    assert.equal((await Call('POST', url, {gs: true, body: conflict})).status, 409);
    assert.deepEqual((await Call('GET', url, {gs: true})).json.payload, snapshot);
    delete process.env.LOCAL_1105_ACCOUNT_ID;
    assert.equal((await Call('GET', url, {gs: true})).status, 404);
});

test('hosted 1.10.5 isolates accounts and initializes weapon XP once without resetting saved progress', async () => {
    const a = (await MakePlayer()).UserId, b = (await MakePlayer()).UserId;
    process.env.LOCAL_1105_REALM = '1';
    process.env.BIND_HOST = '127.0.0.1';
    process.env.PROGRESSION_CONFIG_DIR = path.resolve('../experiments/1.10.5/progression');
    process.env.ACTIVE_HUNT_PASS = 'season17';
    try {
        const snapshot = {nodes: {a: {node_id: 'a', node_status: 2, objectives: []}}, update_version: 1};
        assert.equal((await Call('POST', '/pjm/'+a, {gs:true, body:snapshot})).status, 200);
        assert.equal((await Call('GET', '/pjm/'+a, {as:b})).status, 403);
        assert.deepEqual((await Call('GET', '/pjm', {as:b})).json.payload.nodes, {});
        assert.equal((await Call('POST', '/pjm/nonexistent', {gs:true, body:snapshot})).status, 403);
        assert.equal((await Call('POST', '/migration/trigger', {as:a})).status, 200);
        const db = GetDb().$client;
        const tracks = db.prepare("SELECT progressionId,progress FROM progress_tracks WHERE accountId=? AND progressionId LIKE 'ExperienceTrack_Weapon_%'").all(a) as any[];
        assert.equal(tracks.length, 7); assert.ok(tracks.every(t => t.progress === 0));
        db.prepare('UPDATE progress_tracks SET progress=321 WHERE accountId=? AND progressionId=?').run(a, tracks[0].progressionId);
        Initialize1105Experience(a);
        assert.equal((db.prepare('SELECT progress FROM progress_tracks WHERE accountId=? AND progressionId=?').get(a, tracks[0].progressionId) as any).progress, 321);
        process.env.BIND_HOST = '0.0.0.0';
        assert.equal((await Call('GET', '/pjm', {as:a})).status, 404);
    } finally {
        delete process.env.LOCAL_1105_REALM; delete process.env.PROGRESSION_CONFIG_DIR; delete process.env.ACTIVE_HUNT_PASS;
        process.env.BIND_HOST = '127.0.0.1';
    }
});
