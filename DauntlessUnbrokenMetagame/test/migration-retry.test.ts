import { RemoveTestDb } from './setup';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { GetDb } from '../src/db';

after(() => RemoveTestDb(() => GetDb().$client.close()));

test('a failed migration is retried when its cause is corrected', () => {
    const cwd = process.cwd();
    try {
        // This isolated test directory has no migration files.
        process.chdir(path.dirname(process.env.DB_FILENAME!));
        assert.throws(() => GetDb());
    } finally { process.chdir(cwd); }
    const row = GetDb().$client.prepare('SELECT COUNT(*) AS n FROM users').get() as {n:number};
    assert.equal(row.n, 0);
});
