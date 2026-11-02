const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{createRequire}=require('node:module'),{execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../../..'),repo=path.join(root,'repo');
// Reuse installed build tools; no private launcher code or themes enter this package.
const dep=createRequire(path.join(process.env.LAUNCHER_BUILD_TOOLS||'C:/dr/supporter-themes-20261029/repo/DauntlessUnbrokenLauncher','package.json'));
async function main(){
 const stage=path.join(root,'test-launcher-stage');fs.mkdirSync(stage,{recursive:true});
 for(const name of ['main.cjs','preload.cjs','renderer.js','index.html','accounts.cjs','install.cjs','transport.cjs'])fs.copyFileSync(path.join(__dirname,'launcher',name),path.join(stage,name));
 const ts=dep('typescript');for(const name of ['shared/username','shared/invite','shared/text','main/keystore','main/log']){
  const dest=path.join(stage,'public',name+'.js');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,ts.transpileModule(fs.readFileSync(path.join(repo,'DauntlessUnbrokenLauncher/src',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText);
 }
 fs.writeFileSync(path.join(stage,'shared.cjs'),"module.exports={...require('./public/shared/username.js'),...require('./public/shared/invite.js'),...require('./public/main/keystore.js')};");
 const {MANIFEST_URL,MANIFEST_SHA}=require('./launcher/install.cjs'),manifest=path.join(root,'downloads/Dauntless_1.10.5.365075.manifest');
 if(!fs.existsSync(manifest)){const r=await fetch(MANIFEST_URL);if(!r.ok)throw Error('Could not fetch the GitHub manifest');fs.mkdirSync(path.dirname(manifest),{recursive:true});fs.writeFileSync(manifest,Buffer.from(await r.arrayBuffer()));}
 if(crypto.createHash('sha1').update(fs.readFileSync(manifest)).digest('hex')!==MANIFEST_SHA)throw Error('Wrong manifest');
 const index=execFileSync('go',['run','.',manifest],{cwd:path.join(__dirname,'research/manifest-indexer'),maxBuffer:16*1024**2,windowsHide:true});
 require('./launcher/install.cjs').validateIndex(JSON.parse(index));fs.writeFileSync(path.join(stage,'install-index.json'),index);
 if(process.argv.includes('--stage-only')){console.log(stage);return;}
 const publicConfig=JSON.parse(fs.readFileSync(path.join(root,'hosted-ops/launcher-public.json')));
 const certificate=new crypto.X509Certificate(publicConfig.certificate);
 if(certificate.checkIP(publicConfig.host)!==publicConfig.host||certificate.fingerprint256.replaceAll(':','').toLowerCase()!==publicConfig.fingerprint)throw Error('Public certificate does not match realm');
 fs.writeFileSync(path.join(stage,'config.json'),JSON.stringify({...publicConfig,gameHash:require('./research/build-identity.json').sha256,indexHash:crypto.createHash('sha256').update(index).digest('hex')}));
 fs.writeFileSync(path.join(stage,'package.json'),JSON.stringify({name:'unbroken-1105-test',productName:'Unbroken 1.10.5 Test',version:'1.10.5',main:'main.cjs',private:true}));
 const native=path.join(root,'lab-native');fs.mkdirSync(native,{recursive:true});
 fs.copyFileSync(path.join(__dirname,'bin/DauntlessUnbroken.dll'),path.join(native,'DauntlessUnbroken.dll'));fs.copyFileSync(path.join(repo,'DauntlessUnbrokenLauncher/assets/dxgi.dll'),path.join(native,'dxgi.dll'));
 const [out]=await dep('@electron/packager').packager({dir:stage,out:path.join(root,'test-launcher-build-v2'),name:'Unbroken1105Test',platform:'win32',arch:'x64',electronVersion:dep('electron/package.json').version,asar:true,overwrite:true,icon:path.join(repo,'DauntlessUnbrokenLauncher/assets/icon.ico'),extraResource:[native]});
 const {flipFuses,FuseVersion,FuseV1Options}=dep('@electron/fuses');
 await flipFuses(path.join(out,'Unbroken1105Test.exe'),{version:FuseVersion.V1,[FuseV1Options.RunAsNode]:false,[FuseV1Options.EnableCookieEncryption]:true,[FuseV1Options.EnableNodeOptionsEnvironmentVariable]:false,[FuseV1Options.EnableNodeCliInspectArguments]:false,[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]:true,[FuseV1Options.OnlyLoadAppFromAsar]:true});
 fs.mkdirSync(path.join(root,'share'),{recursive:true});
 fs.writeFileSync(path.join(out,'START-HERE.txt'),'Dauntless Unbroken 1.10.5 test launcher\r\n\r\nExtract this entire folder and run Unbroken1105Test.exe. Keep its other files beside it.\r\nNo Tailscale or VPN needed. Paste a fresh test invite, then import your existing Unbroken account backup to copy your live save once. Or create a new account with that invite.\r\nAfter first login, the same account key works without another invite. Save your key backup.\r\nGame files download directly from Epic using the archived 1.10.5 manifest. Keep the launcher running while playing.\r\nTest saves stay separate from the live realm. Weapon skills start at zero XP (level 1); inventory, quests and unlocks are preserved.\r\n');
 execFileSync('tar.exe',['-a','-cf',path.join(root,'share/Unbroken1105Test-new.zip'),'-C',path.dirname(out),path.basename(out)],{windowsHide:true});
 fs.renameSync(path.join(root,'share/Unbroken1105Test-new.zip'),path.join(root,'share/Unbroken1105Test.zip'));
 console.log(path.join(out,'Unbroken1105Test.exe'));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
