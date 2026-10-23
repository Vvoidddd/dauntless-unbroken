import {randomUUID} from 'node:crypto';
import {bounded,diagnosticBundle,diagnosticRedact} from './diagnostics';
import {request,type Endpoint} from './http';
import type {Snapshot,SupportReportResult} from '../shared/types';

export async function uploadSupportReport(ep:Endpoint,userData:string,snapshot:Snapshot,attemptedName:string,getKey:()=>Promise<string|null>):Promise<SupportReportResult>{
 try{
  const report=JSON.parse(await diagnosticBundle(userData,snapshot));
  // Stay below the gateway's existing 128 KiB cap, including JSON escaping and UTF-8.
  for(const name of Object.keys(report.logs))report.logs[name]=report.logs[name].slice(-24000);
  for(let trim=0;trim<8&&Buffer.byteLength(JSON.stringify(report),'utf8')>96*1024;trim++){
   for(const name of Object.keys(report.logs))report.logs[name]=report.logs[name].slice(Math.ceil(report.logs[name].length/2));
  }
  if(Buffer.byteLength(JSON.stringify(report),'utf8')>96*1024)return {ok:false,error:{code:'server_error'}};
  const id=randomUUID(),key=await bounded(getKey(),null);
  const body=diagnosticRedact(JSON.stringify({id,attemptedName:attemptedName.slice(0,32),report}));
  const res=await request(ep,'/unbroken/api/SupportReport',{method:'POST',headers:key?{'x-dauntless-unbroken-user-api-key':key}:{},body,timeoutMs:20000,maxBytes:8192});
  if(res.status===429)return {ok:false,error:{code:'rate_limited'}};
  if(res.status!==201)return {ok:false,error:{code:'server_error'}};
  const result=JSON.parse(res.body.toString());
  return result.id===id?{ok:true,id}:{ok:false,error:{code:'server_error'}};
 }catch{return {ok:false,error:{code:'server_unreachable'}};}
}
