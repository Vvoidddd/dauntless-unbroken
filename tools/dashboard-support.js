window.setupDashboardSupport=(readKey,get)=>{
 const el=id=>document.getElementById(id);let busy=false,last=0,selected=null;
 const status=message=>{el('supportStatus').textContent=message;};
 async function detail(id){
  try{
   const data=await get('/api/support-reports/'+encodeURIComponent(id));
   selected=id;el('supportDetail').textContent=JSON.stringify(data,null,2);el('supportReview').disabled=!!data.reviewedAt;
  }catch{status('Report could not be loaded.');}
 }
 async function refresh(force=false){
  if(!readKey()||busy||!force&&Date.now()-last<15000)return;
  busy=true;last=Date.now();
  try{
   const data=await get('/api/support-reports?q='+encodeURIComponent(el('supportSearch').value.trim()));
   el('supportCount').textContent=data.unread?` (${data.unread} new)`:'';
   el('supportRows').replaceChildren(...data.reports.map(report=>{
    const row=document.createElement('tr');
    const name=report.username?`${report.username} · verified account`:`${report.claimedName||'Not signed in'} · unverified name`;
    for(const text of [new Date(report.createdAt).toLocaleString(),name,report.accountId||'—',report.launcher,report.summary,report.reviewedAt?'Reviewed':'New']){
     const cell=document.createElement('td');cell.textContent=text;row.append(cell);
    }
    const cell=document.createElement('td'),button=document.createElement('button');button.textContent='Open report';button.onclick=()=>void detail(report.id);cell.append(button);row.append(cell);return row;
   }));
   status(`${data.reports.length} reports shown · retained for up to ${data.retentionDays} days (latest 200).`);
  }catch{status('Support inbox unavailable. Retry after the backend is online.');}
  finally{busy=false;}
 }
 el('supportRefresh').onclick=()=>void refresh(true);
 el('supportSearch').onkeydown=event=>{if(event.key==='Enter')void refresh(true);};
 el('supportReview').onclick=async()=>{
  if(!selected||!readKey())return;el('supportReview').disabled=true;
  try{
   const response=await fetch('/api/support-reports/'+encodeURIComponent(selected)+'/review',{method:'POST',headers:{'x-dashboard-key':readKey()}});
   if(!response.ok)throw Error();await detail(selected);await refresh(true);
  }catch{status('Could not mark the report reviewed. Retry.');el('supportReview').disabled=false;}
 };
 return {refresh};
};
