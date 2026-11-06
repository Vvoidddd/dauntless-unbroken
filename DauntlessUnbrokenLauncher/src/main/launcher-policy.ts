import { request, parseJsonBody, type Endpoint } from './http';

// Compatibility floor, not client authentication. Only stable release floors are accepted.
export function needsLauncherUpdate(version:string,minimum:unknown):boolean {
  if(typeof minimum!=='string'||!/^\d+\.\d+\.\d+$/.test(minimum))return false;
  const current=/^(\d+)\.(\d+)\.(\d+)(-.+)?$/.exec(version);
  if(!current)return true;
  const floor=minimum.split('.').map(Number);
  for(let i=0;i<3;i++){const n=Number(current[i+1]);if(n!==floor[i])return n<floor[i];}
  return !!current[4];
}
export async function requiredLauncherUpdate(ep:Endpoint,version:string,platform:NodeJS.Platform):Promise<string|null>{
  const response=await request(ep,'/unbroken/api/LauncherPolicy',{timeoutMs:8000,maxBytes:4096});
  if(response.status===404)return null;
  if(response.status!==200)throw Error('Cannot check the required launcher version. Try again.');
  const policy=parseJsonBody(response) as {minimumLauncherVersion?:unknown;platforms?:Record<string,unknown>}|null;
  const minimum=policy?.platforms?.[platform]??policy?.minimumLauncherVersion;
  return needsLauncherUpdate(version,minimum)?String(minimum):null;
}
