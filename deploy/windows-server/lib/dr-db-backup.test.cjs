const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const meta = path.resolve(__dirname, '../../../DauntlessUnbrokenMetagame');
const Database = require(path.join(meta, 'node_modules/better-sqlite3'));
const main = require('./dr-db.js');

test('realm backup uses local writer credentials and never falls back after HTTP errors', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbroken-db-auth-'));
    const secret = path.join(dir, 'secrets.json'), dest = path.join(dir, 'copy.db');
    fs.writeFileSync(secret, JSON.stringify({gameserverKey: 'fixture-only'}));
    const original = global.fetch;
    try {
        for (const status of [403, 404, 500]) {
            global.fetch = async (url, options) => {
                assert.equal(url, 'http://127.0.0.1:62000/internal/backup');
                assert.equal(options.headers['x-dauntless-unbroken-gameserver-apikey'], 'fixture-only');
                return new Response('', {status});
            };
            await assert.rejects(main(['backup', meta, path.join(dir, 'absent.db'), dest, '--realm1105', secret]), /Live backup failed/);
            assert.equal(fs.existsSync(dest), false);
        }
    } finally {
        global.fetch = original;
        fs.rmSync(dir, {recursive: true, force: true});
    }
});

test('online backup keeps a consistent snapshot while another connection writes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unbroken-db-backup-'));
    const source = path.join(dir, 'source.db'), dest = path.join(dir, 'copy.db');
    const writer = new Database(source);
    const original = Database.prototype.backup;
    let writes = 0;
    try {
        writer.pragma('journal_mode = WAL');
        writer.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, data BLOB)');
        const insert = writer.prepare('INSERT INTO users(data) VALUES (zeroblob(4096))');
        writer.transaction(() => { for (let i = 0; i < 500; i++) insert.run(); })();
        Database.prototype.backup = function(file, options) {
            return original.call(this, file, {progress: state => {
                insert.run(); writes++;
                return options.progress(state);
            }});
        };
        await main(['backup', meta, source, dest]);
        assert.ok(writes > 3, 'writes overlap multiple backup steps');
        const copy = new Database(dest, {readonly: true});
        try {
            assert.equal(copy.pragma('integrity_check', {simple: true}), 'ok');
            assert.equal(copy.prepare('SELECT count(*) AS n FROM users').get().n, 500);
            assert.equal(writer.prepare('SELECT count(*) AS n FROM users').get().n, 500 + writes);
        } finally { copy.close(); }
    } finally {
        Database.prototype.backup = original;
        writer.close();
        fs.rmSync(dir, {recursive: true, force: true});
    }
});
