window.setupDashboardSupport=(readKey,get)=>{
 const el=id=>document.getElementById(id);let busy=false,last=0,selected=null,generation=0,mutating=false;
 const status=message=>{el('supportStatus').textContent=message;};
 const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
 const date=v=>v?new Date(v).toLocaleString():'—';
 const value=v=>v===true?'Yes':v===false?'No':v===null||v===undefined||v===''?'—':String(v);
 const bytes=v=>typeof v==='number'?`${(v/1073741824).toFixed(1)} GiB`:'—';
 function fields(entries){
  const list=node('dl',undefined,'support-fields');
  for(const [label,v] of entries){const item=node('div');item.append(node('dt',label),node('dd',value(v)));list.append(item);}return list;
 }
 function reset(){
  selected=null;generation++;el('supportTitle').textContent='Report details';
  el('supportMeta').textContent='Select a report to see account details, errors and logs.';
  el('supportDetail').replaceChildren();el('supportReview').disabled=true;el('supportDelete').disabled=true;
 }
 function render(data){
  const report=data.report||{},state=report.state||{},system=report.system||{},logs=report.logs||{};
  el('supportTitle').textContent=data.username||data.claimedName||'Not signed in';
  el('supportMeta').textContent=`${data.username?'Verified account':'Unverified name'} · Received ${date(data.createdAt)} · ${data.reviewedAt?'Reviewed':'New'} · ${data.id}`;
  const tabs=node('div',undefined,'support-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Support report sections');
  const panels=[];
  for(const [key,label] of [['account','Account'],['errors','Errors'],['launcher','Launcher & system'],['logs','Logs']]){
   const button=node('button',label),panel=node('div');button.id=`support-tab-${key}`;panel.id=`support-panel-${key}`;
   button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panel.tabIndex=0;
   tabs.append(button);panels.push(panel);
   button.onclick=()=>{for(let i=0;i<panels.length;i++){const active=panels[i]===panel;panels[i].hidden=!active;tabs.children[i].setAttribute('aria-selected',String(active));tabs.children[i].tabIndex=active?0:-1;}};
   button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const i=Array.from(tabs.children).indexOf(button),n=tabs.children.length,target=tabs.children[event.key==='Home'?0:event.key==='End'?n-1:(i+(event.key==='ArrowLeft'?-1:1)+n)%n];target.click();target.focus();};
  }
  panels[0].append(fields([
   ['Account name',data.account?.name||data.username],['Account UID',data.accountId],['Linked Discord ID',data.account?.discordId],
   ['Name entered in launcher (unverified)',data.claimedName],['Signed in at upload',state.hasAccount],['Reviewed at',date(data.reviewedAt)]
  ]),node('p','Account identity is verified by the server when a valid account key is supplied. Keys, tokens and save files are never shown.'));
  panels[1].append(fields([['Latest error code',state.lastError?.code||'No current error'],['Error details',state.lastError?.detail],['Launcher phase',state.phase],['Busy',state.busy],['Connection problem',state.connectProblem],['Checking connection',state.connectChecking]]));
  const errors=['launcher.old.log','launcher.log'].flatMap(file=>String(logs[file]||'').split('\n').filter(line=>/\b(WARN|ERROR|FATAL)\b/.test(line)).map(line=>`${file} · ${line}`));
  panels[1].append(node('h3',`Warnings & errors (${Math.min(100,errors.length)} of ${errors.length})`),node('p','Showing the most recent entries included in this upload. These can include earlier sessions; compare timestamps with the reported problem.'),node('pre',errors.slice(-100).join('\n')||'No warning or error entries were included.','support-log'));
  panels[2].append(fields([
   ['Launcher version',report.launcher],['Operating system',[system.platform,system.release,system.arch].filter(Boolean).join(' ')],['CPU threads',system.cpuCount],['Memory',bytes(system.memoryBytes)],['Free memory',bytes(system.freeMemoryBytes)],
   ['Game running',state.gameRunning],['Server selected',state.serverSelected],['Game installed',state.installed],['Files verified',state.verified],['Missing files',state.missingFiles],['Game DLLs ready',state.dllsOk],
   ['Active task',state.task?.kind],['Task progress',state.task?`${state.task.doneBytes} / ${state.task.totalBytes} bytes`:null],['Current file',state.task?.currentFile]
  ]));
  for(const name of ['launcher.log','launcher.old.log']){
   const details=node('details');details.open=name==='launcher.log';details.append(node('summary',name),node('pre',logs[name]||'No log included.','support-log'));panels[3].append(details);
  }
  el('supportDetail').replaceChildren(tabs,...panels);tabs.children[0].click();
  el('supportReview').disabled=mutating||!!data.reviewedAt;el('supportDelete').disabled=mutating;
 }
 async function detail(id){
  const request=++generation;selected=id;el('supportReview').disabled=true;el('supportDelete').disabled=true;
  el('supportDetail').replaceChildren(node('p','Loading report…'));
  try{const data=await get('/api/support-reports/'+encodeURIComponent(id));if(request===generation)render(data);}
  catch{if(request===generation){reset();status('Report could not be loaded.');}}
 }
 async function refresh(force=false){
  if(!readKey()||busy||!force&&Date.now()-last<15000)return;
  busy=true;last=Date.now();
  try{
   const data=await get('/api/support-reports?q='+encodeURIComponent(el('supportSearch').value.trim()));
   el('supportCount').textContent=data.unread?` (${data.unread} new)`:'';
   el('supportRows').replaceChildren(...data.reports.map(report=>{
    const row=node('tr'),name=report.username?`${report.username} · verified account`:`${report.claimedName||'Not signed in'} · unverified name`;
    for(const text of [date(report.createdAt),name,report.accountId||'—',report.launcher,report.summary,report.reviewedAt?'Reviewed':'New'])row.append(node('td',text));
    const cell=node('td'),button=node('button','Open report');button.onclick=()=>void detail(report.id);cell.append(button);row.append(cell);return row;
   }));
   status(`${data.reports.length} reports shown · retained for up to ${data.retentionDays} days (latest 200). Delete resolved reports to free storage for reuse.`);
  }catch{status('Support inbox unavailable. Retry after the backend is online.');}
  finally{busy=false;}
 }
 async function mutate(action){
  if(!selected||!readKey()||mutating)return;
  const id=selected;
  if(action==='delete'&&!window.confirm('Permanently delete this report and its uploaded logs? The player account and local logs will not be changed.'))return;
  mutating=true;el('supportReview').disabled=true;el('supportDelete').disabled=true;
  try{
   const response=await fetch('/api/support-reports/'+encodeURIComponent(id)+'/'+action,{method:'POST',headers:{'x-dashboard-key':readKey()}});
   if(!response.ok)throw Error();
   if(selected===id){if(action==='delete')reset();else await detail(id);}
   await refresh(true);if(action==='delete')status('Report and uploaded logs permanently deleted. Player account unchanged.');
  }catch{status(`Could not ${action==='delete'?'delete':'mark'} the report. Retry.`);}
  finally{mutating=false;if(selected)await detail(selected);}
 }
 el('supportRefresh').onclick=()=>void refresh(true);
 el('supportSearch').onkeydown=event=>{if(event.key==='Enter')void refresh(true);};
 el('supportReview').onclick=()=>mutate('review');el('supportDelete').onclick=()=>mutate('delete');
 return {refresh};
};
