import {promises as fs} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {redact} from './log';
import type {Snapshot} from '../shared/types';

export function diagnosticRedact(text:string,paths:string[]=[]):string{
 let out=redact(text);
 for(const p of paths.filter(Boolean).sort((a,b)=>b.length-a.length)){
  for(const variant of [p,p.replace(/\\/g,'/'),p.replace(/\\/g,'\\\\')])out=out.split(variant).join('<local-folder>');
 }
 out=out.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'<token>');
 out=out.replace(/(\b(?:bearer|basic)\s+)[A-Za-z0-9_~+/.=-]+/gi,'$1<token>');
 out=out.replace(/(https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/)[\w-]+/gi,'$1<token>');
 out=out.replace(/(\b(?:[\w-]{0,64}(?:token|secret|password|api[-_]?key|invite[-_]?code)|AUTH_SIGNING_PRIVKEY_B64)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi,'$1<hidden>');
 out=out.replace(/dauntless-unbroken:\/\/[^\s"'<>]+/gi,'<invite>');
 out=out.replace(/([?&](?:key|token|secret|password|code|exchange_code)=)[^&\s"']+/gi,'$1<hidden>');
 return out;
}

async function readLog(file:string,paths:string[]){
 const stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())return 'Unavailable';
 const handle=await fs.open(file,'r');
 try{const size=(await handle.stat()).size,buffer=Buffer.alloc(Math.min(size,256*1024));
  const {bytesRead}=await handle.read(buffer,0,buffer.length,Math.max(0,size-buffer.length));
  return diagnosticRedact(buffer.subarray(0,bytesRead).toString('utf8'),paths);
 }finally{await handle.close();}
}
export async function bounded<T>(work:Promise<T>,fallback:T,ms=1500):Promise<T>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{return await Promise.race([work.catch(()=>fallback),new Promise<T>(resolve=>{timer=setTimeout(()=>resolve(fallback),ms);})]);}
 finally{clearTimeout(timer);}
}
export async function diagnosticBundle(userData:string,snapshot:Snapshot){
 const paths=[userData,os.homedir(),snapshot.install.dir??''];
 const logs:Record<string,string>={};
 // Fixed allowlist: never traverse settings, keys, .env files, databases or player saves.
 for(const name of ['launcher.log','launcher.old.log']){
  const file=path.join(userData,'logs',name);
  logs[name]=await bounded(readLog(file,paths),'Unavailable (unreadable or timed out)');
 }
 const report={format:'dauntless-unbroken-diagnostics',version:1,createdAt:new Date().toISOString(),
  launcher:snapshot.app.version,system:{platform:process.platform,arch:process.arch,release:os.release(),cpuCount:os.cpus().length,memoryBytes:os.totalmem(),freeMemoryBytes:os.freemem()},
  state:{phase:snapshot.phase,busy:snapshot.busy,connectChecking:snapshot.connect?.checking??false,connectProblem:snapshot.connect?.problem??null,task:snapshot.task??null,gameRunning:snapshot.game.running,hasAccount:snapshot.account.hasKey,serverSelected:!!snapshot.server,queue:snapshot.queue??null,
   installed:snapshot.install.installed,missingFiles:snapshot.install.missingFiles,verified:snapshot.install.verified,dllsOk:snapshot.install.dllsOk,lastError:snapshot.lastError},logs};
 return diagnosticRedact(JSON.stringify(report,null,2),paths);
}
