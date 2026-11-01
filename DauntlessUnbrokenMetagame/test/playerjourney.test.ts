import { RemoveTestDb } from './setup';
import './authenv';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { Call, StartApp, StopApp } from './appclient';
import { GetDb } from '../src/db';
import { MakePlayer } from './helpers';

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
