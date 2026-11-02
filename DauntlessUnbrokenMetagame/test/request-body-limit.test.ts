import { RemoveTestDb } from './setup';
import './authenv';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { once } from 'node:events';
import { app } from '../src/app';
import { GetDb } from '../src/db';

test('public compressed bodies obey the decoded budget while native compression remains supported', async () => {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = `http://127.0.0.1:${(server.address() as any).port}/character`;
    try {
        const send = (size: number, forwarded: boolean) => fetch(url, {
            method: 'POST', headers: {'Content-Type':'application/json', 'Content-Encoding':'gzip', ...(forwarded ? {'X-Forwarded-For':'203.0.113.1'} : {})},
            body: gzipSync(JSON.stringify({data: 'x'.repeat(size)})),
        });
        const small = await send(32, true);
        assert.notEqual(small.status, 413);
        assert.notEqual(small.status, 415);
        const large = await send(1024*1024, true);
        assert.equal(large.status, 413);
        const internal = await send(1024*1024, false);
        assert.notEqual(internal.status, 413);
        assert.notEqual(internal.status, 415);
    } finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
        RemoveTestDb(() => GetDb().$client.close());
    }
});
