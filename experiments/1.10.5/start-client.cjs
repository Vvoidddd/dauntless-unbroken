const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const account = JSON.parse(fs.readFileSync(path.join(root, 'backend-state/test-account.json')));
if (!account.UUK) throw new Error('Synthetic local account missing');
const exe = path.join(root, 'game/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe');
const args = ['-AUTH_LOGIN=unused', `-AUTH_PASSWORD=${account.UUK}`, '-AUTH_TYPE=exchangecode',
  '-EpicPortal', '-epicapp=Jackal', '-epicenv=Prod', '-epicusername=Local1105', '-epicuserid=local-lab',
  '-NoEAC', '-windowed', '-ResX=960', '-ResY=540', '-nosound', '-culture=en',
  `-UserDir=${root.replaceAll('\\', '/')}/profile-client/`, '-SaveToUserDir'];
const debug = process.argv.includes('--debug');
const log = debug ? fs.openSync(path.join(root, 'client-debug.log'), 'w') : null;
const child = spawn(debug ? 'C:/Program Files (x86)/Windows Kits/10/Debuggers/x64/cdb.exe' : exe,
  debug ? ['-G', '-g', exe, ...args] : args,
  { cwd: path.dirname(exe), env: { ...process.env, DR_1105_LOCAL_LAB: '1' }, detached: true,
    stdio: debug ? ['ignore', log, log] : 'ignore' });
if (log !== null) fs.closeSync(log);
child.once('error', e => console.error(e.message));
fs.writeFileSync(path.join(root, 'native-client.pid'), String(child.pid));
child.unref();
console.log(`Isolated 1.10.5 client PID ${child.pid}; synthetic local account only`);
