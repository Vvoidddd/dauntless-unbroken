import {test} from 'node:test';import assert from 'node:assert/strict';
import {startDashboard} from './dashboard.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('support inbox is owner-only, proxies fixed backend paths, and requires same-origin review',async()=>{
 const key='test-support-owner-key',id='12345678-1234-4123-8123-123456789abc',calls=[];
 const server=await startDashboard({key,port:0,backend:'http://127.0.0.1:61000',fetcher:async(url,options)=>{
  calls.push({path:url.pathname,method:options?.method,headers:options?.headers});
  if(url.pathname.includes('SupportReports'))return Response.json({reports:[],unread:2,retentionDays:14});
  return Response.json({Users:[],players:[],instances:[],playersOnline:0});
 }});
 try{
  const base=`http://127.0.0.1:${server.address().port}`,headers={'x-dashboard-key':key};
  assert.equal((await fetch(base+'/api/support-reports')).status,401);
  assert.equal((await fetch(base+'/dashboard-support.js')).status,200);
  assert.equal((await fetch(base+'/api/support-reports?q=Test',{headers})).status,200);
  assert.equal(calls.at(-1).path,'/unbroken/api/SupportReports');
  assert.equal((await fetch(base+'/api/support-reports/'+id,{headers})).status,200);
  assert.equal((await fetch(base+'/api/support-reports/'+id+'/review',{method:'POST',headers})).status,403);
  assert.equal((await fetch(base+'/api/support-reports/'+id+'/review',{method:'POST',headers:{...headers,origin:base}})).status,200);
  assert.equal(calls.at(-1).method,'POST');assert.equal(calls.at(-1).headers['x-dauntless-unbroken-user-api-key'],key);
  assert.equal((await fetch(base+'/api/support-reports/'+id+'/review',{headers})).status,405);
  const deletion=base+'/api/support-reports/'+id+'/delete';
  assert.equal((await fetch(deletion,{method:'POST',headers:{origin:base}})).status,401);
  assert.equal((await fetch(deletion,{method:'POST',headers})).status,403);
  assert.equal((await fetch(deletion,{method:'POST',headers:{...headers,origin:'https://untrusted.example'}})).status,403);
  assert.equal((await fetch(deletion,{method:'POST',headers:{...headers,origin:base}})).status,200);
  assert.equal(calls.at(-1).path,'/unbroken/api/SupportReports/'+id+'/delete');
  assert.equal(calls.at(-1).method,'POST');
  assert.equal((await fetch(deletion,{headers})).status,405);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});

async function supportUI(){
 class Element{
  constructor(tag='div'){this.tag=tag;this.children=[];this.textContent='';this.attributes={};this.disabled=false;this.value='';}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=nodes;}
  setAttribute(name,value){this.attributes[name]=value;}click(){return this.onclick?.();}focus(){this.focused=true;}
  set innerHTML(_){throw Error('Untrusted report HTML must never be rendered');}
 }
 const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const document={getElementById:el,createElement:tag=>new Element(tag)},window={confirm:()=>true};
 const id='12345678-1234-4123-8123-123456789abc',reports=[{id,username:'Void',accountId:'UID-verified',launcher:'1.0.25',summary:'server_unreachable',createdAt:Date.now()}];
 const data={...reports[0],claimedName:'Attempted',account:{name:'Void',discordId:'discord-linked'},report:{launcher:'1.0.25',system:{platform:'win32',memoryBytes:1073741824},state:{phase:'register',busy:true,hasAccount:true,lastError:{code:'server_unreachable',detail:'Connection refused'}},logs:{'launcher.log':'INFO ready\n2026-10-22 WARN <img src=x onerror=alert(1)>\n2026-10-22 ERROR connect failed'}}};
 const calls=[];let response=200;
 vm.runInNewContext(await readFile(new URL('./dashboard-support.js',import.meta.url),'utf8'),{window,document,fetch:async(url,options)=>{calls.push({url,options});if(response===200&&url.endsWith('/delete'))reports.splice(0);return {ok:response===200};}});
 const get=async path=>path.includes('?')?{reports,unread:reports.length,retentionDays:14}:data;
 const ui=window.setupDashboardSupport(()=>'owner-key',get);
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 const open=async()=>{await ui.refresh(true);el('supportRows').children[0].children.at(-1).children[0].click();await settle();};
 const text=n=>[n.textContent,...n.children.map(text)].join(' ');
 return {window,el,id,data,calls,ui,open,settle,text,setResponse:n=>response=n};
}
test('support report tabs present verified account, errors, system and logs as safe text',async()=>{
 const h=await supportUI();await h.open();
 assert.equal(h.el('supportTitle').textContent,'Void');assert.match(h.el('supportMeta').textContent,/Verified account/);
 const [tabs,account,errors,system,logs]=h.el('supportDetail').children;
 assert.deepEqual(Array.from(tabs.children,b=>b.textContent),['Account','Errors','Launcher & system','Logs']);
 assert.equal(account.hidden,false);assert.equal(errors.hidden,true);
 assert.match(h.text(account),/UID-verified/);assert.match(h.text(account),/discord-linked/);assert.match(h.text(account),/unverified/);
 tabs.children[1].click();assert.equal(errors.hidden,false);assert.equal(account.hidden,true);
 assert.match(h.text(errors),/server_unreachable/);assert.match(h.text(errors),/Connection refused/);assert.match(h.text(errors),/<img src=x onerror=alert\(1\)>/);
 assert.match(h.text(system),/1\.0 GiB/);assert.match(h.text(logs),/INFO ready/);
 tabs.children[1].onkeydown({key:'End',preventDefault(){}});assert.equal(logs.hidden,false);assert.equal(tabs.children[3].focused,true);
 h.data.username=null;h.data.accountId=null;h.data.account=null;await h.open();assert.match(h.el('supportMeta').textContent,/Unverified name/);
});
test('deleting requires confirmation, preserves failures for retry, and clears a deleted report',async()=>{
 const h=await supportUI();await h.open();h.window.confirm=()=>false;
 await h.el('supportDelete').click();assert.equal(h.calls.length,0);
 h.window.confirm=()=>true;h.setResponse(503);await h.el('supportDelete').click();
 assert.match(h.el('supportStatus').textContent,/Could not delete/);assert.equal(h.el('supportDelete').disabled,false);
 h.setResponse(200);await h.el('supportDelete').click();
 assert.equal(h.calls.at(-1).url,'/api/support-reports/'+h.id+'/delete');assert.equal(h.calls.at(-1).options.method,'POST');
 assert.equal(h.el('supportDetail').children.length,0);assert.equal(h.el('supportDelete').disabled,true);assert.equal(h.el('supportRows').children.length,0);
 assert.match(h.el('supportStatus').textContent,/permanently deleted/);
});
