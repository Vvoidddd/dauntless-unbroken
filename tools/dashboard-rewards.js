window.setupDashboardRewards = (readKey,get) => {
  const el=id=>document.getElementById(id);
  let account=null,items=[],bundles=[],pending=null,grantBusy=false,searchVersion=0;
  const option=(value,text)=>{const node=document.createElement('option');node.value=value;node.textContent=text;return node;};
  function preview(){
    const item=items.find(i=>i.id===el('rewardItem').value),character=account?.characters.find(c=>c.id===el('rewardCharacter').value);
    const weapon=Number.isInteger(item?.maxRank);
    el('rewardQuantity').disabled=grantBusy||weapon;
    el('sendReward').textContent=weapon?'Grant / upgrade weapon':'Grant reward';
    el('rewardPreview').textContent=account&&item&&character?(weapon?`Grant ${item.name} at +${el('rewardRank').value} to ${account.name} / ${character.name}, or raise the existing weapon to that rank. Higher ranks, cells and customizations are preserved.`:`Add ${el('rewardQuantity').value} × ${item.name} to ${account.name} / ${character.name}. Existing cosmetic unlocks are skipped.`):'Select an account, character and reward.';
    el('sendReward').disabled=grantBusy||!account||!item||!character;
    for(const button of el('rewardBundles').querySelectorAll('button')){
      const bundle=bundles.find(b=>b.id===button.dataset.rewardBundle);
      button.disabled=grantBusy||!account||!character||!bundle?.total;
      button.title=bundle?`${bundle.total} catalogue items`:'';
    }
  }
  async function loadAccount(id){
    account=null;el('rewardCharacter').replaceChildren();preview();
    const result=await get('/api/reward-account?accountId='+encodeURIComponent(id));
    if(el('rewardAccount').value!==id)return;
    account=result;
    el('rewardTarget').textContent=`${result.name} · ${result.id}`;
    el('rewardCharacter').replaceChildren(...result.characters.map(c=>option(c.id,`${c.name} · ${c.id}`)));
    const rows=result.history.map(h=>{
      const row=document.createElement('tr');
      for(const text of [new Date(h.at).toLocaleString(),h.characterName,h.itemName,h.bundle?`${h.added} added · ${h.upgradedCount} upgraded · ${h.skipped} already owned`:h.rankAfter!==undefined?`Rank ${h.rankBefore===null?'new':'+'+h.rankBefore} → +${h.rankAfter}`:`+${h.added} (${h.before} → ${h.after})`,h.reason,h.actor]){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}
      return row;
    });
    el('rewardHistory').replaceChildren(...rows);
    el('rewardStatus').textContent=result.characters.length?'Account loaded. Rewards are saved immediately; players may need to relog to see them.':'This account has no character yet.';
    preview();
  }
  async function searchAccounts(){
    try{
      const result=await get('/api/accounts?offset=0&q='+encodeURIComponent(el('rewardAccountSearch').value.trim()));
      el('rewardAccount').replaceChildren(option('','Select a matching account'),...result.accounts.map(a=>option(a.id,`${a.name} · ${a.id}`)));
      account=null;el('rewardCharacter').replaceChildren();el('rewardTarget').textContent='';preview();
      el('rewardStatus').textContent=result.accounts.length?'Select the account to manage.':'No matching accounts.';
    }catch(error){el('rewardStatus').textContent=error.message;}
  }
  async function searchItems(){
    const version=++searchVersion;
    try{
      const result=await get('/api/reward-catalog?q='+encodeURIComponent(el('rewardSearch').value.trim())+'&category='+encodeURIComponent(el('rewardCategory').value));
      if(version!==searchVersion)return;
      if(el('rewardCategory').options.length===1)for(const name of result.categories)el('rewardCategory').append(option(name,name));
      items=result.items;
      bundles=result.bundles??[];
      el('rewardItem').replaceChildren(...items.map(i=>option(i.id,`${i.name} · ${i.id}`)));
      el('rewardMatches').textContent=`${result.total} matches · showing ${items.length}. Narrow the search for more.`;
      itemChanged();
    }catch(error){el('rewardStatus').textContent=error.message;}
  }
  function itemChanged(){
    const item=items.find(i=>i.id===el('rewardItem').value);
    el('rewardQuantity').max=item?.unique?'1':item?.category==='Currency'?'10000000':'10000';
    if(item?.unique)el('rewardQuantity').value='1';
    el('rewardRankControl').hidden=!Number.isInteger(item?.maxRank);
    if(Number.isInteger(item?.maxRank)){
      el('rewardRank').replaceChildren(...Array.from({length:item.maxRank+1},(_,rank)=>option(String(rank),`+${rank}`)));
      el('rewardRank').value=String(item.maxRank);
    }
    preview();
  }
  el('rewardFindAccount').onclick=searchAccounts;
  el('rewardAccountSearch').onkeydown=e=>{if(e.key==='Enter')void searchAccounts();};
  el('rewardAccount').onchange=()=>loadAccount(el('rewardAccount').value).catch(e=>{el('rewardStatus').textContent=e.message;});
  el('refreshRewardAccount').onclick=()=>{if(el('rewardAccount').value)void loadAccount(el('rewardAccount').value).catch(e=>{el('rewardStatus').textContent=e.message;});};
  el('rewardFindItems').onclick=searchItems;
  el('rewardSearch').onkeydown=e=>{if(e.key==='Enter')void searchItems();};
  el('rewardCategory').onchange=searchItems;
  el('rewardItem').onchange=itemChanged;
  el('rewardCharacter').onchange=preview;el('rewardQuantity').oninput=preview;
  el('rewardRank').onchange=preview;
  window.selectRewardAccount=async selected=>{
    el('rewardAccount').replaceChildren(option(selected.id,`${selected.name} · ${selected.id}`));
    document.querySelector('[data-view="rewards"]').click();
    try{await Promise.all([loadAccount(selected.id),searchItems()]);}catch(e){el('rewardStatus').textContent=e.message;}
  };
  document.querySelector('[data-view="rewards"]').addEventListener('click',()=>{if(!items.length)void searchItems();});
  async function sendReward(bundleId){
    if(grantBusy||!account)return;
    const quantity=Number(el('rewardQuantity').value),reason=el('rewardReason').value.trim();
    if(!reason){el('rewardStatus').textContent='Enter an audit reason.';return;}
    const item=items.find(i=>i.id===el('rewardItem').value),weapon=Number.isInteger(item?.maxRank),rank=Number(el('rewardRank').value);
    const bundle=bundles.find(b=>b.id===bundleId),character=account.characters.find(c=>c.id===el('rewardCharacter').value);
    if(!character||(bundleId?!bundle:!item))return;
    if(!bundle&&(!Number.isSafeInteger(quantity)||quantity<1||quantity>Number(el('rewardQuantity').max))){el('rewardStatus').textContent='Enter a valid quantity.';return;}
    if(!bundle&&weapon&&(!Number.isInteger(rank)||rank<0||rank>item.maxRank)){el('rewardStatus').textContent='Select a valid weapon rank.';return;}
    const body={accountId:account.id,characterId:character.id,...(bundle?{bundle:bundle.id}:{catalogId:item.id,quantity,...(weapon?{rank}:{})}),reason};
    const serialized=JSON.stringify(body);
    if(!pending||pending.serialized!==serialized)pending={serialized,requestId:crypto.randomUUID()};
    const confirmation=bundle?`${bundle.name}: ${bundle.total} catalogue items for ${account.name} / ${character.name}.\nExisting unlocks are skipped. Weapons use their own rank caps and keep cells and customizations.`:el('rewardPreview').textContent;
    if(!window.confirm(confirmation+'\nReason: '+reason))return;
    grantBusy=true;preview();
    const controls=Array.from(el('rewardControls').querySelectorAll('input,select,button'));
    for(const control of controls)control.disabled=true;
    try{
      const response=await fetch('/api/reward-grant',{method:'POST',headers:{'x-dashboard-key':readKey(),'content-type':'application/json'},body:JSON.stringify({...body,requestId:pending.requestId}),signal:AbortSignal.timeout(35000)});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'Reward failed. Retry unchanged to reuse the same receipt.');
      pending=null;
      let refreshNote='';
      try{await loadAccount(body.accountId);}catch{refreshNote=' Reward saved; refresh account history when the connection recovers.';}
      el('rewardStatus').textContent=(result.bundle?`Saved ${result.itemName} for ${result.accountName} / ${result.characterName}: ${result.added} added, ${result.upgradedCount} upgraded, ${result.skipped} already owned.${result.replayed?' Previous request; nothing applied twice.':''}`:result.rankAfter!==undefined?`${result.added||result.upgraded?'Saved':'Already owned'} ${result.itemName} at +${result.rankAfter} for ${result.accountName} / ${result.characterName}.${result.replayed?' Previous request; nothing applied twice.':''}`:result.added?`Saved +${result.added} ${result.itemName} for ${result.accountName} / ${result.characterName}. New total: ${result.after}${result.replayed?' (previous request; nothing granted twice)':''}.`:'Already owned: no duplicate cosmetic was added.')+refreshNote;
    }catch(error){el('rewardStatus').textContent=`${error.message} If the connection failed, retry unchanged; the same request cannot grant twice.`;}
    finally{grantBusy=false;for(const control of controls)control.disabled=false;preview();}
  }
  el('sendReward').onclick=()=>sendReward();
  for(const button of el('rewardBundles').querySelectorAll('button'))button.onclick=()=>sendReward(button.dataset.rewardBundle);
  preview();
};
