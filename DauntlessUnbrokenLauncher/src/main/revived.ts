import {promises as fs} from 'node:fs';
import path from 'node:path';
import {spawn,execFile,type ChildProcess} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import net from 'node:net';
import type {RevivedStatus} from '../shared/types';
import {log} from './log';

const INSTALL='DauntlessRevivedLauncher';
const PROFILES=['dauntless-revived-launcher','Dauntless Revived Launcher',INSTALL];
const inside=(parent:string,child:string)=>{const p=path.resolve(parent).toLowerCase(),c=path.resolve(child).toLowerCase();return c===p||c.startsWith(p+path.sep);};
const stat=async(file:string)=>fs.lstat(file).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return null;throw e;});
type NativeAction='stop'|'finish';
interface Options {
 platform:NodeJS.Platform;local:string;roaming:string;shortcuts:string[];
 protectedPaths:()=>string[];changed:(state:RevivedStatus)=>void;
 native?:(action:NativeAction,install:string)=>Promise<void>;
 uninstall?:(exe:string)=>Promise<void>;
 relayPort?:number;checkPort?:()=>Promise<boolean>;
}
function portFree(port:number):Promise<boolean>{return new Promise(resolve=>{const server=net.createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
// Fixed operations, structured stdin. No shell commands, paths or process IDs supplied by the renderer.
export const REVIVED_WINDOWS_SCRIPT=String.raw`$ErrorActionPreference='Stop';$d=[Console]::In.ReadToEnd()|ConvertFrom-Json
if($d.action-eq'stop'){
 $prefix=[IO.Path]::GetFullPath($d.install)+'\'
 foreach($p in Get-CimInstance Win32_Process -Filter "Name='DauntlessRevivedLauncher.exe' OR Name='Update.exe' OR Name='node.exe'"){
  if($p.ExecutablePath-and[IO.Path]::GetFullPath($p.ExecutablePath).StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)){Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop}
 }
}elseif($d.action-eq'finish'){
 $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\DauntlessRevivedLauncher'
 if(Test-Path -LiteralPath $key){$n=(Get-ItemProperty -LiteralPath $key).DisplayName;if($n-in@('Dauntless Revived Launcher','DauntlessRevivedLauncher')){Remove-Item -LiteralPath $key -Force -Confirm:$false}}
 $protocol='HKCU:\Software\Classes\dauntless-revived'
 $command=$protocol+'\shell\open\command'
 if(Test-Path -LiteralPath $command){
  $line=(Get-Item -LiteralPath $command).GetValue('');$prefix=[IO.Path]::GetFullPath($d.install)+'\'
  $exe=if($line-is[string]-and$line-match'^\s*"([^"]+)"'){$Matches[1]}elseif($line-is[string]-and$line-match'^\s*(\S+\.exe)(?:\s|$)'){$Matches[1]}else{$null}
  if($exe){try{$owned=[IO.Path]::GetFullPath($exe).StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)}catch{$owned=$false};if($owned){Remove-Item -LiteralPath $protocol -Recurse -Force -Confirm:$false}}
 }
}else{throw 'Invalid cleanup operation'}`;
export async function revivedNative(action:NativeAction,install:string):Promise<void>{
 const root=process.env.SystemRoot;if(!root||!path.win32.isAbsolute(root))return Promise.reject(Error('Windows system directory unavailable.'));
 // CIM reports canonical executable paths; TEMP can contain an 8.3 alias such as RUNNER~1.
 if(action==='stop')install=await fs.realpath(install).catch((e:NodeJS.ErrnoException)=>{if(e.code==='ENOENT')return install;throw e;});
 return new Promise((resolve,reject)=>{
  const child=execFile(path.win32.join(root,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(REVIVED_WINDOWS_SCRIPT,'utf16le').toString('base64')],{windowsHide:true,timeout:15000,maxBuffer:65536},error=>error?reject(Error('Windows could not stop Revived or remove its uninstall entry. Close Revived and retry.')):resolve());
  child.stdin!.on('error',()=>{});child.stdin!.end(JSON.stringify({action,install}));
 });
}
export function uninstallRevived(exe:string,timeoutMs=60000,launch:(file:string,args:string[])=>ChildProcess=(file,args)=>spawn(file,args,{windowsHide:true,stdio:'ignore'})):Promise<void>{
 return new Promise((resolve,reject)=>{
  const child=launch(exe,['--uninstall','--silent']);
  let stopping=false;
  const timer=setTimeout(()=>{
   stopping=true;
   log.warn('Revived uninstaller exceeded its timeout; stopping its process tree before file cleanup.');
   const root=process.env.SystemRoot;
   if(!root||!child.pid){child.kill();reject(Error('Uninstaller timed out. Close Revived and retry.'));return;}
   execFile(path.join(root,'System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:5000},error=>{
    if(error&&child.exitCode===null){reject(Error('Uninstaller could not be stopped. File deletion was not started.'));return;}
    resolve(); // The safe, per-file cleanup handles incomplete or unsuccessful uninstallers.
   });
  },timeoutMs);
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('exit',code=>{clearTimeout(timer);if(!stopping){if(code!==0)log.warn('Revived uninstaller exited unsuccessfully; checking leftover files.');resolve();}});
 });
}
export class RevivedManager {
 state:RevivedStatus={supported:false,detected:false,canRemove:false,busy:false,phase:'idle',message:'',percent:null,currentFile:'',processed:0,total:0,backupPath:null};
 private refreshing=false;private lastProgress=0;
 constructor(private readonly o:Options){this.state.supported=o.platform==='win32';}
 private update(patch:Partial<RevivedStatus>){this.state={...this.state,...patch};this.o.changed({...this.state});}
 private async paths(){
  if(!path.isAbsolute(this.o.local)||!path.isAbsolute(this.o.roaming))throw Error('Windows user folders unavailable.');
  return {install:path.join(this.o.local,INSTALL),profiles:PROFILES.map(n=>path.join(this.o.roaming,n))};
 }
 async locations():Promise<string[]>{const p=await this.paths();return (await Promise.all([p.install,...p.profiles].map(async file=>(await stat(file))?file:null))).filter((file):file is string=>file!==null);}
 async refresh(){
  if(!this.state.supported||this.state.busy||this.refreshing)return;
  this.refreshing=true;
  try{
   const p=await this.paths(),entries=await Promise.all([p.install,...p.profiles].map(stat));
   const detected=entries.some(Boolean),unsafe=entries.some(s=>s&&(!s.isDirectory()||s.isSymbolicLink()));
   this.update({detected,canRemove:(detected||this.state.phase==='error')&&!unsafe,...(this.state.phase==='idle'?{message:unsafe?'Revived files need manual review because a folder is linked or invalid.':''}:{})});
  }catch{this.update({canRemove:false,message:'Could not check for Revived. Retry the scan.'});}
  finally{this.refreshing=false;}
 }
 private protected(root:string){
  for(const keep of this.o.protectedPaths())if(keep&&(inside(root,keep)||inside(keep,root)))throw Error('This folder overlaps Unbroken or your game files. Automatic removal was stopped.');
 }
 private async tree(root:string,parent:string,leaf:string){
  if(path.resolve(root)!==path.resolve(parent,leaf)||/unbroken/i.test(leaf))throw Error('Unsafe Revived cleanup target.');
  this.protected(root);
  const files:string[]=[],dirs:string[]=[],pending=[root];
  while(pending.length){
   const file=pending.pop()!;if(!inside(root,file))throw Error('Scan escaped its target.');
   const s=await fs.lstat(file);if(s.isSymbolicLink())throw Error('A linked folder or file needs manual review.');
   const name=path.basename(file);
   if(/^DauntlessUnbrokenLauncher\.exe$/i.test(name)||s.isDirectory()&&name.toLowerCase()==='archon')throw Error('Unbroken or game files were found inside this folder. Automatic removal was stopped.');
   if(s.isDirectory()){dirs.push(file);for(const n of await fs.readdir(file))pending.push(path.join(file,n));}else if(s.isFile())files.push(file);else throw Error('Unsupported file type in Revived folder.');
   this.progress({message:`Checking Revived files · ${files.length} files found`,currentFile:name,percent:null});
  }
  return {files,dirs:dirs.sort((a,b)=>b.length-a.length)};
 }
 private progress(patch:Partial<RevivedStatus>,force=false){if(force||Date.now()-this.lastProgress>125){this.lastProgress=Date.now();this.update(patch);}}
 private async assertTarget(file:string,root:string){
  if(!inside(root,file))throw Error('Delete escaped its target.');
  let cursor=file;
  for(;;){const s=await stat(cursor);if(s?.isSymbolicLink())throw Error('A cleanup path changed into a link.');if(path.resolve(cursor)===path.resolve(root))break;cursor=path.dirname(cursor);}
 }
 async remove():Promise<void>{
  if(!this.state.supported||this.state.busy)throw Error('Cleanup unavailable or already running.');
  const p=await this.paths(),previousArchive=this.state.backupPath;let archive:string|null=null,errors=0;
  this.update({busy:true,phase:'removing',message:'Checking cleanup targets',currentFile:'',percent:null,processed:0,total:0,backupPath:null});
  try{
   // Validate every target before invoking an uninstaller, stopping processes or moving data.
   for(const root of [p.install,...p.profiles])if(await stat(root))await this.tree(root,path.dirname(root),path.basename(root));
   this.update({message:'Closing Revived background processes',percent:null,currentFile:''});
   await (this.o.native??revivedNative)('stop',p.install);
   archive=path.join(this.o.roaming,'Revived-Cleanup-'+randomUUID().replace(/-/g,''));
   await fs.mkdir(archive);this.update({backupPath:archive});
   const note=(message:string)=>fs.appendFile(path.join(archive!,'cleanup.log'),new Date().toISOString()+' '+message+'\n','utf8');
   if(previousArchive)await note('Previous cleanup backups: '+previousArchive);
   const backup=async(suffix:string)=>{
    for(const root of p.profiles)if(await stat(root)){
     await this.tree(root,this.o.roaming,path.basename(root));
     const dest=path.join(archive!,path.basename(root)+suffix);
     if(!inside(archive!,dest))throw Error('Unsafe backup destination.');
     this.update({message:'Backing up Revived account data',currentFile:path.basename(root),percent:null});
     await fs.rename(root,dest);await note('BACKED UP '+root);
    }
   };
   await backup('');
   if(await stat(p.install)){
    await this.tree(p.install,this.o.local,INSTALL);
    const exe=path.join(p.install,'Update.exe');
    if((await stat(exe))?.isFile()){
     this.update({message:'Running Revived uninstaller · maximum wait 60 seconds',percent:null,currentFile:'Update.exe'});
     const started=Date.now(),ticker=setInterval(()=>this.update({message:`Waiting for Revived uninstaller · ${Math.floor((Date.now()-started)/1000)} / 60 seconds`,percent:null}),1000);
     try{await (this.o.uninstall??uninstallRevived)(exe);}finally{clearInterval(ticker);}
    }
    if(await stat(p.install)){
     const tree=await this.tree(p.install,this.o.local,INSTALL),items=[...tree.files,...tree.dirs];let done=0;
     for(const file of items){
      this.progress({message:'Removing Revived files',currentFile:path.basename(file),processed:done,total:items.length,percent:Math.floor(done*100/Math.max(1,items.length))},done===0);
      try{
       await this.assertTarget(file,p.install);const s=await stat(file);
       if(s?.isDirectory())await fs.rmdir(file);
       else if(s)try{await fs.unlink(file);}catch(error){
        if((error as NodeJS.ErrnoException).code!=='EPERM'||s.nlink>1)throw error;
        await this.assertTarget(file,p.install);await fs.chmod(file,s.mode|0o200);await fs.unlink(file);
       }
      }
      catch{errors++;await note('NOT REMOVED '+file);}
      done++;
     }
     this.progress({processed:done,total:items.length,percent:100},true);
    }
   }
   await backup('-after-uninstall');
   this.update({message:'Removing Revived shortcuts',currentFile:'',percent:null});
   for(const base of this.o.shortcuts)for(const dir of [base,...PROFILES.map(name=>path.join(base,name))]){
    const shortcut=path.join(dir,'Dauntless Revived Launcher.lnk');const s=await stat(shortcut);
    if(s){try{await this.assertTarget(shortcut,base);if(!s.isFile()||s.isSymbolicLink())throw Error('Invalid shortcut');await fs.unlink(shortcut);}catch{errors++;await note('NOT REMOVED '+shortcut);}}
    if(dir!==base&&(await stat(dir))?.isDirectory())try{await this.assertTarget(dir,base);await fs.rmdir(dir);}catch{/* Keep nonempty or linked shortcut folders. */}
   }
   if(await stat(p.install))errors++;
   if(errors)throw Error('Some Revived files could not be removed. Close Revived and retry; cleanup.log lists the remaining paths.');
   this.update({message:'Removing Revived uninstall entry',currentFile:'',percent:null});
   await (this.o.native??revivedNative)('finish',p.install);
   await note('COMPLETE - Unbroken and downloaded game files preserved.');
   this.update({message:'Checking the local game connection port',currentFile:'',percent:null});
   const free=await (this.o.checkPort??(()=>portFree(this.o.relayPort??61000)))();
   if(!free){await note('Port is still occupied by another program. No unrelated process was stopped.');log.warn('Revived removed, but the local game connection port is still occupied.');}
   this.update({phase:'done',message:free?'Revived removed. Unbroken, downloaded game files and account backups were preserved.':`Revived removed, but port ${this.o.relayPort??61000} is still used by another program. Close other launchers or local servers, then retry Play. Your backups were preserved.`,percent:100,currentFile:''});
  }catch(error){
   const message=error instanceof Error?error.message:'Cleanup failed. Close Revived and retry.';
   if(archive)await fs.appendFile(path.join(archive,'cleanup.log'),'STOPPED '+message+'\n').catch(()=>{});
   this.update({phase:'error',message,percent:null,currentFile:''});throw error;
  }finally{this.update({busy:false});await this.refresh();}
 }
}
