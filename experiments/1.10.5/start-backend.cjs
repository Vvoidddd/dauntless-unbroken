const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const net = require('node:net');
const root = path.resolve(__dirname, '../../..');
const state = path.join(root, 'backend-state');
const selected = require('./lab-account.cjs');
const hosted = process.env.LOCAL_1105_REALM === '1';
if (hosted) {
    selected.database = path.join(state, 'realm.db');
    if (!fs.existsSync(selected.database)) {
        if(!fs.existsSync(path.join(state,'hosted.json')))throw Error('Prepare the separate realm database first');
        fs.writeFileSync(selected.database,'',{flag:'wx'});
    }
}
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
    if(pair.gatewaySecret)env.GATEWAY_SECRET=pair.gatewaySecret;
    if(pair.keyRecoveryServiceSecret)env.KEY_RECOVERY_SERVICE_SECRET=pair.keyRecoveryServiceSecret;
    if(pair.gatewaySecret)env.DISCORD_KEY_STATE_URL='http://127.0.0.1:61112';
    Object.assign(env, { NODE_ENV: 'production', PORT: '62000', BIND_HOST: '127.0.0.1',
        AUTH_MODE: 'APIKEY', REGISTRATION_MODE: hosted ? 'INVITECODE' : 'OPEN', DB_FILENAME: selected.database,
        AUTH_SIGNING_PRIVKEY_B64: Buffer.from(pair.privateKey).toString('base64'),
        AUTH_SIGNING_PUBKEY_B64: Buffer.from(pair.publicKey).toString('base64'),
        MATCHMAKING_MODE: 'DEPLOYSERVER', DEPLOYSERVER_URL: '127.0.0.1:62001',
        QOS_TARGET_URL: 'http://127.0.0.1:62000/QoS', TARGET_CHANGELIST: '365075',
        LOCAL_1105_ACCOUNT_ID: selected.userId,
        LOCAL_1105_REALM: hosted ? '1' : '0', SERVER_NAME: 'Dauntless Unbroken',
        PROGRESSION_CONFIG_DIR: path.join(__dirname, 'progression'), ACTIVE_HUNT_PASS: 'season09b',
        ESCALATION_MODE: 'real', STORE: 'free', STORE_RAMS: '1', STORE_WEEKLY_ROTATION: '1',
        BACKUP_ROOT: path.join(root, 'backups'),
        CHAT: '1', CHAT_PORT: '62099', CHAT_BIND_HOST: '127.0.0.1', LOG_BODIES: '0', ACCOUNT_KEY_RECOVERY: hosted ? '1' : '0' });
    Object.assign(env,require('./maintenance-config.cjs').readMaintenance(path.join(state,'maintenance.json')));
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
    const db = new Database(selected.database, { timeout: 5000 });
    try {
        if(fs.existsSync(path.join(state,'hosted.json'))){
            const ownerFile=path.join(state,'realm-owner.key');
            if(!fs.existsSync(ownerFile))fs.writeFileSync(ownerFile,'UUK-'+crypto.randomBytes(32).toString('hex'),{flag:'wx'});
            const uid='UID-11050000-0000-4000-8000-000000000001',hash=crypto.createHash('sha256').update(fs.readFileSync(ownerFile,'utf8').trim()).digest('hex');
            db.transaction(()=>{db.prepare('INSERT OR IGNORE INTO users(userId,name,notes,isAdmin) VALUES (?, ?, 0, 1)').run(uid,'LabOwner');db.prepare('INSERT OR IGNORE INTO userapikeys(userId,keyHash) VALUES (?,?)').run(uid,hash);})();
        }
        const hash = crypto.createHash('sha256').update(pair.gameserverKey).digest('hex');
        db.prepare('INSERT INTO gameserverapikeys(keyHash) SELECT ? WHERE NOT EXISTS (SELECT 1 FROM gameserverapikeys WHERE keyHash=?)').run(hash, hash);
    } finally { db.close(); }
    const accountFile = selected.accountFile;
    if (!hosted && !fs.existsSync(accountFile)) {
        const response = await fetch('http://127.0.0.1:62000/unbroken/api/Register', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ Username: 'Local1105' }), signal: AbortSignal.timeout(5000) });
        if (!response.ok) { child.kill(); throw new Error(`Local registration failed: ${response.status}`); }
        const account = await response.json();
        if (!account.UUK) { child.kill(); throw new Error('Local registration returned no test key'); }
        fs.writeFileSync(accountFile, JSON.stringify(account), { flag: 'wx' });
    }
    console.log(`Local metagame 127.0.0.1:62000; isolated ${selected.name} compatibility test; local allocator required.`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
