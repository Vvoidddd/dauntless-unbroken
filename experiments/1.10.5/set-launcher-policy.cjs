// Local administrator switch. 'off' removes the compatibility floor, not authentication.
const fs=require('node:fs'),path=require('node:path');
const minimum=process.argv[2];
if(minimum!=='off'&&!/^\d+\.\d+\.\d+$/.test(minimum||''))throw Error('Usage: node set-launcher-policy.cjs 1.0.45|off');
const file=path.resolve(__dirname,'../../../backend-state/launcher-policy.json');
fs.writeFileSync(file+'.tmp',JSON.stringify({gameVersion:'1.10.5',minimumLauncherVersion:minimum==='off'?null:minimum}));
fs.renameSync(file+'.tmp',file);
console.log(`Minimum public launcher: ${minimum}`);
