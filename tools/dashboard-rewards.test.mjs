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
  for(const offset of ['-1','1.5','1e3','100001'])assert.equal((await fetch(base+'/api/reward-catalog?q=&offset='+offset,{headers})).status,400);
  const body={requestId:'same-receipt',accountId:'UID-target',quantity:10};
  for(let i=0;i<2;i++)assert.equal((await fetch(base+'/api/reward-grant',{method:'POST',headers,body:JSON.stringify(body)})).status,200);
  assert.equal(writes[0].body,writes[1].body);
  assert.equal((await fetch(base+'/api/reward-catalog?q=Rams&category=Currency&offset=100',{headers})).status,200);
  assert.equal(new URL(writes[2].url).host,'127.0.0.1:61000');assert.equal(new URL(writes[2].url).pathname,'/unbroken/api/RewardCatalog');
  assert.equal(new URL(writes[2].url).searchParams.get('offset'),'100');
  const js=await fetch(base+'/dashboard-rewards.js');assert.equal(js.status,200);assert.match(await js.text(),/setupDashboardRewards/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

test('reward catalogue UI pages through all matches and explains unavailable items without allowing a grant',async()=>{
 const elements=new Map();
 class Element{
  value='';textContent='';children=[];disabled=false;max='10000';options=[];
  append(...nodes){this.children.push(...nodes);this.options=this.children;}
  replaceChildren(...nodes){this.children=nodes;this.options=nodes;this.value=nodes[0]?.value??'';}
  addEventListener(){} click(){} querySelectorAll(){return [];}
 }
 const document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),querySelector:()=>new Element()};
 const el=id=>document.getElementById(id),window={confirm:()=>true},offsets=[];
 const account={id:'UID-target',name:'Slayer',characters:[{id:'character-1',name:'Slayer'}],history:[]};
 const all=Array.from({length:101},(_,i)=>({id:'ITEM_'+i,name:'Item '+i,category:'Materials',kind:'stacked',unique:false,grantable:i>0,...(i===0?{unavailableReason:'Obsolete item; choose the current version'}:{})}));
 vm.runInNewContext(await readFile(new URL('./dashboard-rewards.js',import.meta.url),'utf8'),{window,document,crypto,AbortSignal,fetch:()=>{throw Error('No grant should run during browsing');}});
 window.setupDashboardRewards(()=>'',async path=>{if(path.includes('reward-account'))return account;const offset=Number(new URL(path,'http://localhost').searchParams.get('offset'));offsets.push(offset);return {items:all.slice(offset,offset+100),total:101,offset,categories:['Materials'],bundles:[]};});
 await window.selectRewardAccount(account);
 assert.equal(el('sendReward').disabled,true);assert.match(el('rewardPreview').textContent,/Obsolete item/);assert.equal(el('rewardNext').disabled,false);assert.equal(el('rewardPrevious').disabled,true);
 await el('rewardNext').onclick();assert.equal(el('rewardItem').value,'ITEM_100');assert.equal(el('sendReward').disabled,false);assert.equal(el('rewardNext').disabled,true);assert.equal(el('rewardPrevious').disabled,false);assert.match(el('rewardMatches').textContent,/101–101/);
 await el('rewardPrevious').onclick();assert.deepEqual(offsets,[0,100,0]);assert.equal(el('sendReward').disabled,true);
});

for(const mode of ['currency','weapon','bulk','boost'])test(`reward UI ${mode} retries uncertain grants with the same ID and treats failed history refresh as saved`,async()=>{
 const weapon=mode==='weapon',bulk=mode==='bulk',boost=mode==='boost';
 const elements=new Map();
 class Element{
  value='';textContent='';children=[];disabled=false;max='10000';options=[];
  append(...nodes){this.children.push(...nodes);this.options=this.children;}
  replaceChildren(...nodes){this.children=nodes;this.options=nodes;this.value=nodes[0]?.value??'';}
  addEventListener(){} click(){} querySelectorAll(){return [];}
 }
 const document={getElementById(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:()=>new Element(),querySelector:()=>new Element()};
 const el=id=>document.getElementById(id),window={confirm:()=>true};
 const bulkButtons=['cosmetics','transmogs','dyes','flares','weapons','armour'].map(id=>Object.assign(new Element(),{dataset:{rewardBundle:id}}));
 el('rewardBundles').querySelectorAll=()=>bulkButtons;
 el('rewardControls').querySelectorAll=()=>[...elements.values(),...bulkButtons];
 const account={id:'UID-target',name:'Slayer',characters:[{id:'character-1',name:'Slayer'}],history:[]};
 const item=boost?{id:'escalation_xp_boost_entitlement',name:'Escalation XP boost',kind:'entitlement',category:'Boosts',unique:false}:weapon?{id:'WP_EB_LERAWR',name:'Drask Sword',kind:'instanced',category:'Weapons',unique:true,maxRank:15}:{id:'CURRENCY_NOTES',name:'Rams',kind:'stacked',category:'Currency',unique:false};
 let requests=[],refreshFails=false;
 const get=async path=>{
  if(path.includes('reward-account')){if(refreshFails)throw Error('History offline');return account;}
  return {items:[item],total:1,categories:['Currency'],bundles:[{id:'cosmetics',name:'All cosmetics',total:2159}]};
 };
 el('rewardQuantity').value='10000';el('rewardReason').value='Event';
 vm.runInNewContext(await readFile(new URL('./dashboard-rewards.js',import.meta.url),'utf8'),{window,document,crypto,AbortSignal,fetch:async(url,options)=>{
  requests.push(JSON.parse(options.body));assert.ok(bulkButtons.every(b=>b.disabled));await bulkButtons[0].onclick();
  if(requests.length===1)throw Error('Connection timed out');refreshFails=true;
  return Response.json(boost?{unit:'hours',added:24,expiresAt:'2026-10-24T00:00:00Z',itemName:'Escalation XP boost',accountName:'Slayer',replayed:true}:bulk?{bundle:'cosmetics',added:2000,upgradedCount:0,skipped:159,itemName:'All cosmetics',accountName:'Slayer',characterName:'Slayer',replayed:true}:weapon?{added:0,upgraded:true,rankBefore:3,rankAfter:15,itemName:'Drask Sword',accountName:'Slayer',characterName:'Slayer',replayed:true}:{added:10000,itemName:'Rams',accountName:'Slayer',characterName:'Slayer',after:10000,replayed:true});
 }});
 window.setupDashboardRewards(()=> 'owner-fixture',get);
 await window.selectRewardAccount(account);
 assert.match(el('rewardPreview').textContent,/Slayer/);
 if(weapon){assert.equal(el('rewardRankControl').hidden,false);assert.equal(el('rewardRank').options.length,16);assert.equal(el('rewardRank').value,'15');assert.equal(el('rewardQuantity').value,'1');assert.equal(el('rewardQuantity').disabled,true);assert.match(el('rewardPreview').textContent,/raise the existing weapon/);}
 else assert.equal(el('rewardRankControl').hidden,true);
 if(boost){assert.equal(el('rewardQuantity').max,'720');assert.equal(el('rewardQuantity').value,'24');assert.match(el('rewardQuantityLabel').textContent,/hours/);assert.match(el('rewardPreview').textContent,/Starts immediately/);}
 const send=bulk?()=>bulkButtons[0].onclick():()=>el('sendReward').onclick();
 assert.equal(bulkButtons[0].disabled,false);
 await send();assert.match(el('rewardStatus').textContent,/retry unchanged/i);
 await send();
 assert.equal(requests.length,2);assert.equal(requests[0].requestId,requests[1].requestId);
 assert.equal(requests[0].rank,weapon?15:undefined);
 if(bulk){assert.equal(requests[0].bundle,'cosmetics');assert.equal(requests[0].catalogId,undefined);assert.equal(requests[0].quantity,undefined);}
 assert.match(el('rewardStatus').textContent,boost?/Saved \+24 hours/:bulk?/2000 added, 0 upgraded, 159 already owned/:weapon?/Saved Drask Sword at \+15/:/Saved \+10000/);assert.match(el('rewardStatus').textContent,/Reward saved; refresh/);
});
