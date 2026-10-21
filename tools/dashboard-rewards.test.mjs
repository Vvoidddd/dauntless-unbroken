import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {startDashboard} from './dashboard.mjs';

test('reward proxy authenticates reads/writes, enforces origin and caps bodies',async()=>{
 const writes=[],key='private-dashboard-rewards-test';
 const server=await startDashboard({key,port:0,backend:'http://127.0.0.1:61000',fetcher:async(url,options)=>{
  if(url.pathname.includes('/Reward')){writes.push({url:String(url),method:options.method,body:options.body});return Response.json({ok:true});}
  return Response.json(url.pathname.endsWith('GetAllUsers')?{Users:[]}:{players:[],instances:[],playersOnline:0});
 }});
 try{
  const base=`http://127.0.0.1:${server.address().port}`,headers={'x-dashboard-key':key,'content-type':'application/json',origin:base};
  assert.equal((await fetch(base+'/api/reward-catalog?q=Rams')).status,401);
  assert.equal((await fetch(base+'/api/reward-grant',{method:'POST',body:'{}'})).status,401);
  assert.equal((await fetch(base+'/api/reward-grant',{method:'POST',headers:{...headers,origin:'https://evil.test'},body:'{}'})).status,403);
  assert.equal((await fetch(base+'/api/reward-grant',{method:'POST',headers,body:'bad-json'})).status,400);
  assert.equal((await fetch(base+'/api/reward-grant',{method:'POST',headers,body:'x'.repeat(4097)})).status,413);
  assert.equal(writes.length,0);
  assert.equal((await fetch(base+'/api/reward-account?accountId=//evil.test',{headers})).status,400);
  const body={requestId:'same-receipt',accountId:'UID-target',quantity:10};
  for(let i=0;i<2;i++)assert.equal((await fetch(base+'/api/reward-grant',{method:'POST',headers,body:JSON.stringify(body)})).status,200);
  assert.equal(writes[0].body,writes[1].body);
  assert.equal((await fetch(base+'/api/reward-catalog?q=Rams&category=Currency',{headers})).status,200);
  assert.equal(new URL(writes[2].url).host,'127.0.0.1:61000');assert.equal(new URL(writes[2].url).pathname,'/unbroken/api/RewardCatalog');
  const js=await fetch(base+'/dashboard-rewards.js');assert.equal(js.status,200);assert.match(await js.text(),/setupDashboardRewards/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('reward UI retries uncertain grants with the same ID and treats failed history refresh as saved',async()=>{
 const elements=new Map();
 class Element{
  value='';textContent='';children=[];disabled=false;max='10000';options=[];
  append(...nodes){this.children.push(...nodes);this.options=this.children;}
  replaceChildren(...nodes){this.children=nodes;this.options=nodes;this.value=nodes[0]?.value??'';}
  addEventListener(){} click(){} querySelectorAll(){return [];}
 }
 const document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),querySelector:()=>new Element()};
 const el=id=>document.getElementById(id),window={confirm:()=>true};
 const account={id:'UID-target',name:'Slayer',characters:[{id:'character-1',name:'Slayer'}],history:[]};
 const item={id:'CURRENCY_NOTES',name:'Rams',kind:'stacked',category:'Currency',unique:false};
 let requests=[],refreshFails=false;
 const get=async path=>{
  if(path.includes('reward-account')){if(refreshFails)throw Error('History offline');return account;}
  return {items:[item],total:1,categories:['Currency']};
 };
 el('rewardQuantity').value='10000';el('rewardReason').value='Event';
 vm.runInNewContext(await readFile(new URL('./dashboard-rewards.js',import.meta.url),'utf8'),{window,document,crypto,AbortSignal,fetch:async(url,options)=>{
  requests.push(JSON.parse(options.body));if(requests.length===1)throw Error('Connection timed out');refreshFails=true;
  return Response.json({added:10000,itemName:'Rams',accountName:'Slayer',characterName:'Slayer',after:10000,replayed:true});
 }});
 window.setupDashboardRewards(()=> 'owner-fixture',get);
 await window.selectRewardAccount(account);
 assert.match(el('rewardPreview').textContent,/Slayer/);
 await el('sendReward').onclick();assert.match(el('rewardStatus').textContent,/retry unchanged/i);
 await el('sendReward').onclick();
 assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);
 assert.match(el('rewardStatus').textContent,/Saved \+10000/);assert.match(el('rewardStatus').textContent,/Reward saved; refresh/);
});
