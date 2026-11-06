import {test} from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,execFile} from 'node:child_process';
import {RevivedManager,uninstallRevived,revivedNative,REVIVED_WINDOWS_SCRIPT} from '../src/main/revived';
import {isUnbrokenFleet,revivedConnection} from '../src/shared/server-identity';
import type {RevivedStatus,Snapshot} from '../src/shared/types';

async function fixture(t:any){
 const base=await fs.mkdtemp(path.join(tmpdir(),'unbroken-revived-'));
 const local=path.join(base,'local'),roaming=path.join(base,'roaming'),desktop=path.join(base,'desktop'),keep=path.join(local,'DauntlessUnbrokenLauncher'),game=path.join(base,'game');
 for(const dir of [local,roaming,desktop,keep,game])await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(keep,'keep.txt'),'Unbroken');await fs.writeFile(path.join(game,'save.txt'),'Game save');
 const states:RevivedStatus[]=[],native:string[]=[],protectedPaths=[keep,game];
 const manager=new RevivedManager({platform:'win32',local,roaming,shortcuts:[desktop],protectedPaths:()=>protectedPaths,changed:s=>states.push(s),native:async action=>{native.push(action);},uninstall:async()=>{},checkPort:async()=>true});
 const install=path.join(local,'DauntlessRevivedLauncher'),profile=path.join(roaming,'dauntless-revived-launcher');
 t.after(async()=>{
  // This test owns the entire freshly-created temp root. Never operate outside it.
  assert.ok(path.resolve(base).startsWith(path.resolve(tmpdir())+path.sep));await fs.rm(base,{recursive:true,force:true});
 });
 return {base,local,roaming,desktop,keep,game,states,native,manager,install,profile,protectedPaths};
}
test('detection is read-only and removal preserves Unbroken, shared game files and all account backup bytes',async t=>{
 const h=await fixture(t);await fs.mkdir(h.install);await fs.mkdir(path.join(h.install,'app-0.1'),{recursive:true});
 await fs.writeFile(path.join(h.install,'Update.exe'),'Fake updater - never executed');await fs.writeFile(path.join(h.install,'app-0.1','DauntlessRevivedLauncher.exe'),'Fake legacy exe');
 await fs.writeFile(path.join(h.install,'read-only.txt'),'Read-only fixture');await fs.chmod(path.join(h.install,'read-only.txt'),0o444);
 await fs.mkdir(h.profile);await fs.writeFile(path.join(h.profile,'account.key'),'Fixture key');await fs.writeFile(path.join(h.profile,'offline.db'),'Fixture save');
 await fs.writeFile(path.join(h.desktop,'Dauntless Revived Launcher.lnk'),'Old shortcut');await fs.writeFile(path.join(h.desktop,'Dauntless Unbroken Launcher.lnk'),'Keep shortcut');
 await h.manager.refresh();assert.equal(h.manager.state.detected,true);assert.equal(h.manager.state.canRemove,true);
 assert.equal(await fs.readFile(path.join(h.profile,'account.key'),'utf8'),'Fixture key');assert.deepEqual(h.native,[]);
 await h.manager.remove();assert.equal(h.manager.state.phase,'done');assert.equal(h.manager.state.detected,false);assert.equal(h.manager.state.busy,false);
 const archive=h.manager.state.backupPath!;assert.equal(await fs.readFile(path.join(archive,path.basename(h.profile),'account.key'),'utf8'),'Fixture key');assert.equal(await fs.readFile(path.join(archive,path.basename(h.profile),'offline.db'),'utf8'),'Fixture save');
 await assert.rejects(fs.stat(h.install),{code:'ENOENT'});await assert.rejects(fs.stat(path.join(h.desktop,'Dauntless Revived Launcher.lnk')),{code:'ENOENT'});
 assert.equal(await fs.readFile(path.join(h.keep,'keep.txt'),'utf8'),'Unbroken');assert.equal(await fs.readFile(path.join(h.game,'save.txt'),'utf8'),'Game save');assert.equal(await fs.readFile(path.join(h.desktop,'Dauntless Unbroken Launcher.lnk'),'utf8'),'Keep shortcut');
 assert.deepEqual(h.native,['stop','finish']);assert.ok(h.states.some(s=>s.currentFile&&s.message==='Removing Revived files'));assert.ok(h.states.some(s=>s.total>0&&s.processed===s.total));
});
for(const kind of ['link','embedded-unbroken','shared-game','protected-overlap'])test(`cleanup refuses ${kind} before stopping anything or moving profiles`,async t=>{
 const h=await fixture(t);await fs.mkdir(h.install);await fs.mkdir(h.profile);await fs.writeFile(path.join(h.profile,'account.key'),'Keep');
 if(kind==='link')await fs.symlink(h.keep,path.join(h.install,'linked'),process.platform==='win32'?'junction':'dir');
 if(kind==='embedded-unbroken')await fs.writeFile(path.join(h.install,'DauntlessUnbrokenLauncher.exe'),'Protected');
 if(kind==='shared-game')await fs.mkdir(path.join(h.install,'Archon'));
 if(kind==='protected-overlap')h.protectedPaths.push(path.join(h.install,'nested-game'));
 await assert.rejects(h.manager.remove());assert.equal(h.manager.state.phase,'error');assert.equal(h.manager.state.busy,false);assert.deepEqual(h.native,[]);assert.equal(await fs.readFile(path.join(h.profile,'account.key'),'utf8'),'Keep');assert.equal(await fs.readFile(path.join(h.keep,'keep.txt'),'utf8'),'Unbroken');
});
test('files created by the uninstaller are scanned again, and recreated profiles are backed up too',async t=>{
 const h=await fixture(t);await fs.mkdir(h.install);await fs.mkdir(h.profile);await fs.writeFile(path.join(h.profile,'key'),'Original');await fs.writeFile(path.join(h.install,'Update.exe'),'Never executed');
 const manager=new RevivedManager({platform:'win32',local:h.local,roaming:h.roaming,shortcuts:[],protectedPaths:()=>[h.keep,h.game],changed:()=>{},native:async()=>{},uninstall:async()=>{await fs.mkdir(h.profile);await fs.writeFile(path.join(h.profile,'new-key'),'New fixture');await fs.writeFile(path.join(h.install,'leftover'),'Left over');}});
 await manager.remove();const archive=manager.state.backupPath!;
 assert.equal(await fs.readFile(path.join(archive,path.basename(h.profile),'key'),'utf8'),'Original');assert.equal(await fs.readFile(path.join(archive,path.basename(h.profile)+'-after-uninstall','new-key'),'utf8'),'New fixture');await assert.rejects(fs.stat(h.install),{code:'ENOENT'});
});
test('a newly introduced link after initial validation is refused after the uninstaller',async t=>{
 const h=await fixture(t);await fs.mkdir(h.install);await fs.writeFile(path.join(h.install,'Update.exe'),'Never executed');
 const manager=new RevivedManager({platform:'win32',local:h.local,roaming:h.roaming,shortcuts:[],protectedPaths:()=>[h.keep],changed:()=>{},native:async()=>{},uninstall:async()=>{await fs.symlink(h.keep,path.join(h.install,'new-link'),process.platform==='win32'?'junction':'dir');}});
 await assert.rejects(manager.remove(),/linked/);assert.equal(await fs.readFile(path.join(h.keep,'keep.txt'),'utf8'),'Unbroken');
});
test('non-Windows clients never run Windows cleanup',async t=>{
 const h=await fixture(t),manager=new RevivedManager({platform:'linux',local:h.local,roaming:h.roaming,shortcuts:[],protectedPaths:()=>[],changed:()=>{},native:async()=>{throw Error('Must not execute');}});
 await manager.refresh();assert.equal(manager.state.supported,false);await assert.rejects(manager.remove(),/unavailable/);
});
test('an unrelated port owner is reported after cleanup and is never stopped',async t=>{
 const h=await fixture(t);await fs.mkdir(h.install);await fs.writeFile(path.join(h.install,'leftover'),'Fixture');
 const manager=new RevivedManager({platform:'win32',local:h.local,roaming:h.roaming,shortcuts:[],protectedPaths:()=>[h.keep],changed:()=>{},native:async action=>{h.native.push(action);},checkPort:async()=>false});
 await manager.remove();assert.equal(manager.state.phase,'done');assert.equal(manager.state.detected,false);assert.match(manager.state.message,/still used by another program/);assert.deepEqual(h.native,['stop','finish']);
});
test('timed-out Windows uninstaller stops its owned process and returns to safe cleanup',{skip:process.platform!=='win32'},async()=>{
 let child:ReturnType<typeof spawn>|undefined;
 try{
  const started=Date.now();await uninstallRevived('test-only',250,()=>child=spawn(process.execPath,['-e','setTimeout(()=>{},30000)'],{windowsHide:true,stdio:'ignore'}));
  assert.ok(Date.now()-started<8000);await new Promise(resolve=>setTimeout(resolve,100));assert.notEqual(child?.exitCode,null);
 }finally{if(child?.exitCode===null)child.kill();}
});
for(const alias of [false,true])test(`native stop accepts quoted paths and canonicalizes aliases (${alias})`,{skip:process.platform!=='win32'},async t=>{
 const h=await fixture(t),root=path.join(h.base,"quoted ' $ root",'DauntlessRevivedLauncher'),exe=path.join(root,'node.exe');
 await fs.mkdir(root,{recursive:true});try{await fs.link(process.execPath,exe);}catch{await fs.copyFile(process.execPath,exe);}
 const selected=alias?path.join(h.base,'native-alias'):root;if(alias)await fs.symlink(root,selected,'junction');
 const child=spawn(exe,['-e',"console.log('ready');setInterval(()=>{},1000)"],{windowsHide:true,stdio:['ignore','pipe','ignore']});
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Test child did not start')),5000);child.once('error',reject);child.stdout!.once('data',()=>{clearTimeout(timer);resolve();});});
  await revivedNative('stop',selected);
  if(child.exitCode===null){
   const script=`$p=Get-CimInstance Win32_Process -Filter "ProcessId=${child.pid}";[pscustomobject]@{ExecutablePath=$p.ExecutablePath;Name=$p.Name}|ConvertTo-Json -Compress`;
   const diagnostic=await new Promise<string>((resolve,reject)=>execFile(path.join(process.env.SystemRoot!,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:5000},(e,out)=>e?reject(e):resolve(out)));
   if(child.exitCode===null)await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Native cleanup did not stop its owned component: '+JSON.stringify({root,selected,diagnostic}))),5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});
  }
  assert.notEqual(child.exitCode,null);assert.equal(await fs.readFile(path.join(h.keep,'keep.txt'),'utf8'),'Unbroken');
 }finally{if(child.exitCode===null){const stopped=new Promise(resolve=>child.once('exit',resolve));child.kill();await stopped;}}
});
for(const owner of ['revived','unbroken'])test(`registry cleanup preserves an ${owner==='unbroken'?'Unbroken-owned':'unrelated'} handler and removes only Revived-owned entries (${owner})`,{skip:process.platform!=='win32'},async t=>{
 const h=await fixture(t);
 const mocks=String.raw`$script:removed=@()
function Test-Path {param($LiteralPath) return $true}
function Get-ItemProperty {param($LiteralPath) return [pscustomobject]@{DisplayName='Dauntless Revived Launcher'}}
function Get-Item {param($LiteralPath) $o=[pscustomobject]@{Line=$d.testLine};$o|Add-Member -MemberType ScriptMethod -Name GetValue -Value {param($name) return $this.Line};return $o}
function Remove-Item {param($LiteralPath,[switch]$Force,[switch]$Recurse,$Confirm) $script:removed+=,$LiteralPath}
`;
 const script=mocks+REVIVED_WINDOWS_SCRIPT+String.raw`
ConvertTo-Json -InputObject @($script:removed) -Compress`;
 const result=await new Promise<string>((resolve,reject)=>{
  const child=execFile(path.join(process.env.SystemRoot!,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:8000},(error,out,err)=>error?reject(Error(err||error.message)):resolve(out));
  child.stdin!.end(JSON.stringify({action:'finish',install:h.install,testLine:'"'+path.join(owner==='revived'?h.install:h.keep,owner==='revived'?'DauntlessRevivedLauncher.exe':'DauntlessUnbrokenLauncher.exe')+'" "%1" "'+h.install+'\\argument-only"'}));
 });
 const removed=JSON.parse(result) as string[];
 assert.ok(removed.includes('HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\DauntlessRevivedLauncher'));
 assert.equal(removed.includes('HKCU:\\Software\\Classes\\dauntless-revived'),owner==='revived');
 assert.ok(!removed.some(key=>/unbroken/i.test(key)));
});
test('official identity normalization requires the exact existing endpoint and certificate; other Revived labels remain warnings',()=>{
 const server={mode:'public',host:'5.83.134.32',port:443,fingerprint:'997da5dfa16cf4d7e260fd3f19e0a53730578442f60b6b4057965c1f2780d07e',name:'Dauntless Revived'} as Snapshot['server'];
 assert.equal(isUnbrokenFleet(server),true);assert.equal(revivedConnection({server,status:null}),false);
 assert.equal(revivedConnection({server:{...server!,fingerprint:'f'.repeat(64)},status:null}),true);
 assert.equal(isUnbrokenFleet({...server!,host:'other.example'}),false);assert.equal(revivedConnection({server:{...server!,host:'other.example'},status:null}),true);
 assert.equal(revivedConnection({server:{...server!,host:'other.example'},status:{name:'Dauntless Unbroken'} as Snapshot['status']}),false);
 assert.equal(revivedConnection({server:null,status:null}),false);
});
