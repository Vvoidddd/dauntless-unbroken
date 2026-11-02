import {net} from 'electron';
import type {ClientRequest} from 'node:http';

// Chromium honors OS proxy settings. Keep TLS verification, refuse redirects,
// and never send launcher cookies/account credentials to the public file CDN.
export function chromiumCdnRequest(url:URL,headers:Record<string,string>):ClientRequest {
  if(url.protocol!=='https:'||url.username||url.password)throw Error('CDN requires HTTPS');
  const request=net.request({url:url.href,method:'GET',redirect:'error',credentials:'omit',useSessionCookies:false});
  for(const [name,value] of Object.entries(headers))request.setHeader(name,value);
  return request as unknown as ClientRequest;
}
