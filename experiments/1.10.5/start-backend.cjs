const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const net = require('node:net');
const root = path.resolve(__dirname, '../../..');
const state = path.join(root, 'backend-state');
fs.mkdirSync(state, { recursive: true });
async function main() {
    await new Promise((resolve, reject) => {
        const check = net.createServer();
        check.once('error', reject);
        check.listen(62000, '127.0.0.1', () => check.close(resolve));
    });
    const secretsFile = path.join(state, 'secrets.json');
    if (!fs.existsSync(secretsFile)) {
        const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048,
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
        fs.writeFileSync(secretsFile, JSON.stringify(pair), { flag: 'wx' });
    }
    const pair = JSON.parse(fs.readFileSync(secretsFile));
    if (!pair.gameserverKey) {
        pair.gameserverKey = crypto.randomBytes(32).toString('hex');
        fs.writeFileSync(secretsFile + '.tmp', JSON.stringify(pair), { flag: 'wx' });
        fs.renameSync(secretsFile + '.tmp', secretsFile);
    }
    if (!/^[a-f0-9]{64}$/.test(pair.gameserverKey)) throw new Error('Invalid local server credential');
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA)$/i.test(key)));
    Object.assign(env, { NODE_ENV: 'production', PORT: '62000', BIND_HOST: '127.0.0.1',
        AUTH_MODE: 'APIKEY', REGISTRATION_MODE: 'OPEN', DB_FILENAME: path.join(state, 'synthetic.db'),
        AUTH_SIGNING_PRIVKEY_B64: Buffer.from(pair.privateKey).toString('base64'),
        AUTH_SIGNING_PUBKEY_B64: Buffer.from(pair.publicKey).toString('base64'),
        MATCHMAKING_MODE: 'DEPLOYSERVER', DEPLOYSERVER_URL: '127.0.0.1:62001',
        QOS_TARGET_URL: 'http://127.0.0.1:62000/QoS', TARGET_CHANGELIST: '365075',
        LOCAL_1105_ACCOUNT_ID: 'UID-6f8b231d-f682-4cbb-b5e2-a9972f641ea4',
        CHAT: '0', LOG_BODIES: '0', ACCOUNT_KEY_RECOVERY: '0' });
    const log = fs.openSync(path.join(root, 'backend.log'), 'a');
    const child = spawn(process.execPath, ['dist/server.js'], { cwd: path.join(root, 'repo/DauntlessUnbrokenMetagame'), env, windowsHide: true, stdio: ['ignore', log, log] });
    fs.closeSync(log);
    fs.writeFileSync(path.join(root, 'backend.pid'), String(child.pid));
    child.once('error', e => { console.error(e.message); process.exitCode = 1; });
    child.once('exit', code => { console.log('Local backend exited:', code); process.exitCode = code || 0; });
    let ready = false;
    for (let n = 0; n < 40 && child.exitCode === null; n++) {
        try { await fetch('http://127.0.0.1:62000/QoS', { signal: AbortSignal.timeout(1000) }); ready = true; break; } catch {}
        await new Promise(r => setTimeout(r, 250));
    }
    if (!ready) { child.kill(); throw new Error('Local backend did not become ready; inspect backend.log'); }
    const Database = require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
    const db = new Database(path.join(state, 'synthetic.db'), { timeout: 5000 });
    try {
        const hash = crypto.createHash('sha256').update(pair.gameserverKey).digest('hex');
        db.prepare('INSERT INTO gameserverapikeys(keyHash) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM gameserverapikeys WHERE keyHash=?)').run(hash, hash);
    } finally { db.close(); }
    const accountFile = path.join(state, 'test-account.json');
    if (!fs.existsSync(accountFile)) {
        const response = await fetch('http://127.0.0.1:62000/unbroken/api/Register', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ Username: 'Local1105' }), signal: AbortSignal.timeout(5000) });
        if (!response.ok) { child.kill(); throw new Error(`Local registration failed: ${response.status}`); }
        const account = await response.json();
        if (!account.UUK) { child.kill(); throw new Error('Local registration returned no test key'); }
        fs.writeFileSync(accountFile, JSON.stringify(account), { flag: 'wx' });
    }
    console.log('Local metagame listening on 127.0.0.1:62000; synthetic Local1105 account; local allocator required.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
