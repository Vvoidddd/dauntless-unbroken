import {GetDb} from '../db';
import {Redact} from '../credential-redaction';

const object=(v:any):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max:number)=>typeof v==='string'?v.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').slice(0,max):'';
export function ScrubSupportText(value:unknown,max=200000){
 return Redact(text(value,max)).split(/\r?\n/).map(line=>
  /token|password|secret|authorization|api.?key|invite.?code|exchange_code|UUK_|eyJ|cookie|dauntless-unbroken:\/\/|[A-Za-z0-9_-]{64}/i.test(line)?'[credential-bearing line omitted]':line.slice(0,4000)).join('\n');
}
export function CleanSupportReport(value:any){
 if(!object(value)||value.format!=='dauntless-unbroken-diagnostics'||value.version!==1||!object(value.state)||!object(value.logs))throw Error('Invalid report');
 const state:Record<string,unknown>={};
 for(const key of ['phase','busy','gameRunning','hasAccount','serverSelected','installed','missingFiles','verified','dllsOk','connectChecking','connectProblem']){
  const v=value.state[key];if(typeof v==='string')state[key]=ScrubSupportText(v,160);else if(typeof v==='boolean'||v===null||typeof v==='number'&&Number.isFinite(v))state[key]=v;
 }
 if(object(value.state.lastError))state.lastError={code:ScrubSupportText(value.state.lastError.code,100),detail:ScrubSupportText(value.state.lastError.detail,2000)};
 if(object(value.state.task))state.task={kind:text(value.state.task.kind,30),doneBytes:Number(value.state.task.doneBytes)||0,totalBytes:Number(value.state.task.totalBytes)||0,currentFile:ScrubSupportText(value.state.task.currentFile,300)};
 const system:Record<string,unknown>={};
 for(const key of ['platform','arch','release','cpuCount','memoryBytes','freeMemoryBytes']){const v=value.system?.[key];if(typeof v==='string')system[key]=ScrubSupportText(v,100);else if(typeof v==='number'&&Number.isFinite(v)&&v>=0)system[key]=v;}
 const logs:Record<string,string>={};for(const name of ['launcher.log','launcher.old.log'])if(typeof value.logs[name]==='string')logs[name]=ScrubSupportText(value.logs[name]);
 return {format:value.format,version:1,launcher:ScrubSupportText(value.launcher,80),system,state,logs};
}
function prune(now:number){
 const db=GetDb().$client;
 db.prepare('DELETE FROM support_reports WHERE created_at < ?').run(now-14*86400000);
 db.prepare('DELETE FROM support_reports WHERE id IN (SELECT id FROM support_reports ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET 200)').run();
}
export function SaveSupportReport(id:string,body:any,identity?:{UserId:string;Username:string},credential?:string){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw Error('Invalid report ID');
 if(credential&&credential.length>=6)body=JSON.parse(JSON.stringify(body).split(credential).join('<hidden>'));
 const report=CleanSupportReport(body.report),payload=JSON.stringify(report),claimed=ScrubSupportText(body.attemptedName,32),now=Date.now();
 const db=GetDb().$client;
 return db.transaction(()=>{
  const old=db.prepare('SELECT account_id,report FROM support_reports WHERE id=?').get(id) as any;
  if(old){if(old.account_id!==(identity?.UserId??null)||old.report!==payload)throw Error('Report ID already used');return {id};}
  const summary=ScrubSupportText((report.state.lastError as any)?.code||`${report.state.phase??'unknown'}${report.state.busy?' · busy':''}`,200);
  db.prepare('INSERT INTO support_reports (id,created_at,account_id,username,claimed_name,launcher,summary,report) VALUES (?,?,?,?,?,?,?,?)')
   .run(id,now,identity?.UserId??null,identity?.Username??null,claimed,report.launcher,summary,payload);
  prune(now);return {id};
 })();
}
export function SupportReports(query:string){
 prune(Date.now());const db=GetDb().$client,q=text(query,100);
 const reports=db.prepare('SELECT id,created_at AS createdAt,account_id AS accountId,username,claimed_name AS claimedName,launcher,summary,reviewed_at AS reviewedAt FROM support_reports WHERE instr(lower(coalesce(username,\'\')||\' \'||claimed_name||\' \'||coalesce(account_id,\'\')||\' \'||id),lower(?))>0 ORDER BY created_at DESC,rowid DESC LIMIT 50').all(q);
 const unread=(db.prepare('SELECT count(*) AS n FROM support_reports WHERE reviewed_at IS NULL').get() as any).n;
 return {reports,unread,retentionDays:14};
}
export function SupportReport(id:string){
 const row=GetDb().$client.prepare('SELECT id,created_at AS createdAt,account_id AS accountId,username,claimed_name AS claimedName,reviewed_at AS reviewedAt,report FROM support_reports WHERE id=?').get(id) as any;
 if(!row)return null;
 const account=row.accountId?GetDb().$client.prepare('SELECT u.userId AS id,u.name,d.discordId FROM users u LEFT JOIN discordlinks d ON d.userId=u.userId WHERE u.userId=?').get(row.accountId):null;
 return {...row,report:JSON.parse(row.report),account:account??null};
}
export function ReviewSupportReport(id:string){return GetDb().$client.prepare('UPDATE support_reports SET reviewed_at=? WHERE id=?').run(Date.now(),id).changes>0;}
export function DeleteSupportReport(id:string){return GetDb().$client.prepare('DELETE FROM support_reports WHERE id=?').run(id).changes>0;}
