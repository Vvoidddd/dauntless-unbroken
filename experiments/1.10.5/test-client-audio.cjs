const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const client = fs.readFileSync(path.join(dir, 'start-client.cjs'), 'utf8');
const launcher = fs.readFileSync(path.join(dir, 'launcher', 'main.cjs'), 'utf8');
const server = fs.readFileSync(path.join(dir, 'start-server.ps1'), 'utf8');

assert.doesNotMatch(client, /['"]-nosound['"]/i, 'the 1.10.5 client must keep audio enabled');
assert.doesNotMatch(launcher, /['"]-nosound['"]/i, 'the 1.10.5 launcher client must keep audio enabled');
assert.match(server, /['"]-nosound['"]/i, 'the dedicated server must remain headless');
console.log('1.10.5 client audio arguments are enabled and server audio remains disabled');
