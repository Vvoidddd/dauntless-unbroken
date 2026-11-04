(() => {
  let key = '', busy = false, lastSample = null, lastWorker = null, lastAus = null, lastGermany = null, lastEu2 = null, accountPage = [], accountOffset = 0, nextOffset = null, accountsBusy = false;
  let fleetDrainResult = '';
  window.setupDashboardRewards?.(()=>key,get);
  const support=window.setupDashboardSupport?.(()=>key,get);
  const el = id => document.getElementById(id);
  const number = (n, suffix = '') => Number.isFinite(n) ? `${n.toFixed(1)}${suffix}` : '—';
  const duration = seconds => Number.isFinite(seconds) && seconds >= 0 ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m` : '—';

  const polish=document.createElement('style');
  polish.textContent=`
  :root{color-scheme:dark;--surface:#141218;--surface-container:#211f26;--surface-high:#2b2930;--outline:#49454f;--on-surface:#e6e1e5;--on-variant:#cac4d0;--primary:#d0bcff;--primary-container:#4f378b;--error:#ffb4ab}
  html{min-height:100%;background:var(--surface)}
  body{min-height:100vh;margin:0;background:var(--surface);color:var(--on-surface);font:14px/1.5 system-ui,'Segoe UI',sans-serif;letter-spacing:.1px}
  header{height:64px;padding:0 24px;display:flex;align-items:center;gap:16px;background:var(--surface-container);border-bottom:1px solid var(--outline);position:sticky;top:0;z-index:20}
  header h1{font-size:22px;letter-spacing:0;font-weight:400}.eyebrow{color:var(--on-variant);font-size:10px;letter-spacing:1.6px}.badge{color:var(--primary);background:transparent;border-color:var(--outline)}
  main{width:auto;max-width:none;padding:32px 40px}.login{max-width:480px;margin:10vh auto;padding:36px!important}.login h2{font-size:28px;letter-spacing:0;font-weight:400}
  body:has(#data:not([hidden])) main{margin-left:256px;max-width:1800px}
  .ops-sidebar{position:fixed;left:0;top:64px;bottom:0;width:256px;padding:24px 12px;background:var(--surface-container);border-right:1px solid var(--outline);display:flex;flex-direction:column;align-items:stretch;gap:20px;overflow-y:auto;z-index:10}
  .ops-sidebar:before{content:'WORKSPACE';padding:0 16px;color:var(--on-variant);font-size:11px;letter-spacing:1.2px}
  .ops-sidebar nav{display:flex;flex-direction:column;gap:4px;flex-wrap:nowrap;margin:0;padding:0;background:none;border:0;border-radius:0}
  .ops-sidebar nav button{min-height:44px;text-align:left;padding:0 16px;background:transparent;color:var(--on-variant);border:0;border-radius:0 24px 24px 0;font-size:14px;white-space:normal}
  .ops-sidebar nav button:before{content:'○';display:inline-block;width:28px;color:var(--on-variant)}
  .ops-sidebar nav button:hover{background:#d0bcff14;color:var(--on-surface);box-shadow:none}
  .ops-sidebar nav button[aria-pressed=true]{background:#4f378b;color:#fff;font-weight:600}
  .ops-sidebar nav button[aria-pressed=true]:before{content:'●';color:var(--primary)}.ops-sidebar #logout{margin-top:auto;background:transparent;color:var(--on-variant);border-color:var(--outline)}
  h2{font-size:22px;font-weight:400;letter-spacing:0}h3{font-size:13px;color:var(--on-variant);font-weight:500}p{color:var(--on-variant);font-size:14px}
  .card{background:var(--surface-container);border:1px solid var(--outline);border-radius:16px;padding:24px;box-shadow:none;margin-bottom:24px}
  .grid{gap:20px}.metrics{gap:16px}.metric strong{font-size:34px;font-weight:400;letter-spacing:-.5px;line-height:1.3;font-variant-numeric:tabular-nums;margin:10px 0}.metric span,small{font-size:12px;color:var(--on-variant)}
  .ops-hero{background:var(--surface-high);padding:32px!important;border-radius:24px}.ops-hero h2{font-size:32px;letter-spacing:0;font-weight:400;margin:5px 0 6px}.ops-hero .metrics{margin:26px 0 0}.ops-hero .metric{border-top:1px solid var(--outline);padding-top:18px}
  .ops-charts{margin:24px 0}.ops-charts .card{min-width:0}.ops-charts h2{font-size:16px;font-weight:500}
  button,input,select,textarea{background:var(--surface-high);color:var(--on-surface);border:1px solid var(--outline);border-radius:8px;padding:10px 14px}button{transition:background .16s,border-color .16s,color .16s}button:hover{background:#d0bcff14;border-color:var(--primary);box-shadow:none}
  .primary{background:var(--primary);color:#332e3d;border-color:var(--primary)}.primary:hover{background:#e8ddff;color:#211a2d}input:focus-visible,button:focus-visible,select:focus-visible,textarea:focus-visible,canvas:focus-visible{outline:2px solid var(--primary);outline-offset:3px}
  .table-wrap{border:1px solid var(--outline);border-radius:12px}table{font-size:13px}th{font-size:11px;text-transform:uppercase;letter-spacing:.5px;background:var(--surface-high);color:var(--on-variant)}td,th{padding:15px 16px;border-bottom:1px solid var(--outline)}tbody tr:last-child td{border:0}tbody tr:hover{background:#d0bcff0d}
  #rewardControls .grid>div{min-width:0}#rewardControls select{max-width:100%;text-overflow:ellipsis}#rewardPreview{overflow-wrap:anywhere}
  canvas{cursor:crosshair;border-radius:12px}pre{background:var(--surface);border:1px solid var(--outline)}#freshness{color:var(--on-variant)}.footnote{color:var(--on-variant);font-size:12px}.view{animation:ops-enter .18s ease-out}
  @keyframes ops-enter{from{opacity:.5;transform:translateY(4px)}to{opacity:1;transform:none}}
  .icon-button{display:none;border:0;background:transparent;font-size:22px;padding:8px;min-width:40px}
  @media(min-width:1500px){main{padding:40px 56px}.ops-hero h2{font-size:36px}}
  @media(max-width:1000px){.ops-sidebar{width:220px}body:has(#data:not([hidden])) main{margin-left:220px;padding:28px}.ops-sidebar nav button{padding:0 12px;font-size:13px}}
  @media(max-width:700px){header{height:64px;padding:0 16px}.icon-button{display:block}body:has(#data:not([hidden])) main{margin-left:0;padding:16px}.ops-sidebar{top:64px;bottom:auto;max-height:calc(100vh - 64px);width:min(86vw,320px);padding:20px 12px;transform:translateX(-110%);transition:transform .2s ease;box-shadow:8px 12px 30px #0008}.ops-sidebar.mobile-open{transform:translateX(0)}.ops-sidebar:before{display:block}.ops-sidebar nav{flex-direction:column;overflow:visible;padding:0}.ops-sidebar nav button{white-space:normal}.ops-sidebar #logout{align-self:stretch}.card{padding:18px}.ops-hero h2{font-size:26px}}
  @media(prefers-reduced-motion:reduce){.view,.ops-sidebar{animation:none;transition:none}button{transition:none}}
  `;
  document.head.append(polish);
  const navigation=document.querySelector('#data nav');
  if(navigation){
    navigation.parentElement.classList.add('ops-sidebar');
    const menuToggle=el('menuToggle');
    const closeMenu=()=>{navigation.parentElement.classList.remove('mobile-open');menuToggle?.setAttribute('aria-expanded','false');};
    menuToggle?.addEventListener('click',()=>{
      const open=navigation.parentElement.classList.toggle('mobile-open');
      menuToggle.setAttribute('aria-expanded',String(open));
    });
    navigation.addEventListener('click',event=>{if(event.target.closest('button'))closeMenu();});
  }
  const overview=document.getElementById('overview');
  if(overview){
    const hero=overview.querySelector('.card');
    if(hero){
      hero.classList.add('ops-hero');
      hero.querySelector('h2').textContent='Your realm. At a glance.';
      hero.querySelector('p').textContent='Two EU game hosts · UK key bot and backup storage. Shared accounts and progression.';
    }
    const charts=Array.from(overview.children).find(node=>node.classList.contains('grid')&&node.querySelector('canvas'));
    if(charts&&hero){charts.classList.add('ops-charts');hero.after(charts);}
  }
  if(overview && !document.getElementById('applyIslandEvent')){
    const card=document.createElement('section');
    card.className='card';
    card.innerHTML='<h2>Island event schedule</h2><p>Controls the seasonal island schedule returned by the metagame. Changes apply to new schedule requests.</p><label for="islandEventMode">Mode</label><select id="islandEventMode"><option value="default">Default server setting</option><option value="off">Off</option><option value="trials">Trials active</option></select> <button id="applyIslandEvent">Apply island event mode</button><p id="islandEventStatus" role="status">Checking availability...</p>';
    overview.append(card);
  }

  const fleetHistory=[];
  const fleetCharts=['fleetCpuChart','fleetRamChart','fleetHuntChart'];
  const charts = ['cpu', 'ramUsedMB', 'players', 'backendMs', 'requestsPerSecond', 'errorPercent', 'eventLoopP95Ms', 'backendRssMB', 'backendHeapMB'];
  function table(id, rows) { el(id).replaceChildren(...rows.map(cells => { const tr = document.createElement('tr'); for (const text of cells) { const td = document.createElement('td'); td.textContent = text; tr.append(td); } return tr; })); }
  async function get(path) {
    const response = await fetch(path, {headers: {'x-dashboard-key': key}, signal: AbortSignal.timeout(35000)});
    if (!response.ok) throw new Error(response.status === 401 ? 'Owner key rejected.' : 'Dashboard request failed.');
    return response.json();
  }
  function graph(id, history) {
    const canvas = el(id);
    if (!canvas || !canvas.clientWidth) return;
    const ctx = canvas.getContext('2d'), ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth, height = 180, left = 12, right = width - 12, top = 32, bottom = 150;
    canvas.width = width * ratio; canvas.height = height * ratio;
    canvas.style.height = height + 'px';
    ctx.scale(ratio, ratio);
    const values = history.map(row => row[id]);
    const finite = values.filter(Number.isFinite), peak = Math.max(0, ...finite), max = Math.max(1, peak);
    const x = i => left + i / Math.max(1, values.length - 1) * (right - left);
    const y = v => bottom - v / max * (bottom - top);
    const time = i => Number.isFinite(Date.parse(history[i]?.at)) ? new Date(history[i].at).toLocaleTimeString() : 'Time unavailable';
    const value = v => Number.isFinite(v) ? v.toLocaleString(undefined, {maximumFractionDigits:2}) : 'Unavailable';
    const label = canvas.parentElement.querySelector('h2,h3')?.textContent || id;
    canvas.tabIndex = 0; canvas.setAttribute('role','img');
    canvas.setAttribute('aria-label', label + '. Hover to inspect; arrow keys select a sample; Escape returns to live.');
    canvas.title = 'Hover or touch to inspect · ← → browse samples · Escape to return to live';
    const selectedAt = canvas.dataset.selectedAt;
    let selected = selectedAt ? history.findIndex(row => String(row.at) === selectedAt) : -1;
    function draw() {
      ctx.clearRect(0,0,width,height);
      ctx.font = '12px system-ui'; ctx.lineWidth = 1;
      for (let n=0;n<=3;n++) {
        const line = top + n*(bottom-top)/3;
        ctx.strokeStyle = '#262830'; ctx.beginPath();ctx.moveTo(left,line);ctx.lineTo(right,line);ctx.stroke();
      }
      ctx.strokeStyle = '#b8bdd9';ctx.lineWidth=2;ctx.beginPath();
      let gap=true;
      values.forEach((v,i)=>{if(!Number.isFinite(v)){gap=true;return;} if(gap)ctx.moveTo(x(i),y(v));else ctx.lineTo(x(i),y(v));gap=false;});ctx.stroke();
      ctx.fillStyle='#858996';ctx.fillText(time(0),left,174);
      const end=time(history.length-1);ctx.fillText(end,Math.max(left,right-ctx.measureText(end).width),174);
      ctx.fillStyle='#edf3f8';
      ctx.fillText(selected<0 ? `Current ${value(values.at(-1))} · Peak ${finite.length?value(peak):'Unavailable'}` : `${time(selected)} · ${value(values[selected])}`,left,18);
      if(selected>=0 && selected<values.length){
        ctx.strokeStyle='#edf3f8';ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x(selected),top);ctx.lineTo(x(selected),bottom);ctx.stroke();ctx.setLineDash([]);
        if(Number.isFinite(values[selected])){ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x(selected),y(values[selected]),4,0,Math.PI*2);ctx.fill();}
      }
    }
    function select(index){selected=index; if(index>=0)canvas.dataset.selectedAt=String(history[index].at);else delete canvas.dataset.selectedAt;draw();}
    canvas.onpointermove=event=>{if(!values.length)return;const pos=event.clientX-canvas.getBoundingClientRect().left;select(Math.max(0,Math.min(values.length-1,Math.round((pos-left)/(right-left)*(values.length-1)))));};
    canvas.onpointerleave=()=>select(-1);
    canvas.onkeydown=event=>{if(event.key==='Escape'){select(-1);return;}if(!values.length||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();select(Math.max(0,Math.min(values.length-1,(selected<0?values.length-1:selected)+(event.key==='ArrowLeft'?-1:1))));};
    draw();
  }

  function renderDiscord(stats) {
    const fields={botLinked:stats?.linkedAccounts,botIssued:stats?.bot?.issued,botUnused:stats?.bot?.unused,botRedeemed:stats?.bot?.redeemed,botPending:stats?.bot?.pending,botRevoked:stats?.bot?.revoked};
    for(const [id,value] of Object.entries(fields)) el(id).textContent=Number.isSafeInteger(value)&&value>=0 ? value : '—';
    el('botStatsStatus').textContent=stats ? `${stats.error || 'Counts from the central account database and bot claim history.'} Updated ${new Date(stats.at).toLocaleTimeString()}` : 'Bot statistics unavailable.';
  }

  function renderLiveHosts(value) {
    if (!value || !Array.isArray(value.hosts)) throw new Error('Invalid live host response');
    table('liveHostRows', value.hosts.map(host => [
      host.name,
      host.online ? 'Online' : 'Unavailable / stale',
      host.running ?? '—',
      host.pending ?? '—',
      number(host.cpu, '%'),
      `${number(host.memoryUsedMB)} / ${number(host.memoryTotalMB)} MB`,
      host.draining === true ? 'Draining' : host.draining === false ? 'Open' : 'Unknown'
    ]));
    el('liveHostStatus').textContent = `Last live reading: ${Number.isFinite(Date.parse(value.at)) ? new Date(value.at).toLocaleString() : 'time unavailable'}`;
  }

  async function refreshLiveHosts() {
    try { renderLiveHosts(await get('/api/live-hosts')); }
    catch { el('liveHostStatus').textContent = 'Live server readings unavailable.'; }
  }


  function renderFleet(fleet) {
    if (!fleet) return;
    table('fleetRows',fleet.rows.map(s=>[s.name,s.online?'Online':'Unavailable / stale',s.hunts ?? '—',number(s.cpu,'%'),`${number(s.ramUsedMB===null?null:s.ramUsedMB/1024)} / ${number(s.ramTotalMB===null?null:s.ramTotalMB/1024)} GB`,s.huntSampleAt ? new Date(s.huntSampleAt).toLocaleTimeString() : '—']));
    const t=fleet.totals;
    fleetHistory.push({at:new Date().toISOString(),fleetCpuChart:t.meanCpu,fleetRamChart:t.ramUsedMB,fleetHuntChart:t.hunts});
    if(fleetHistory.length>720)fleetHistory.shift();
    for(const id of fleetCharts)graph(id,fleetHistory);
    el('fleetOnline').textContent=`${t.online} / ${t.servers}`;
    el('fleetMeanCpu').textContent=number(t.meanCpu,'%');
    el('fleetHunts').textContent=t.hunts ?? '—';
    el('fleetRam').textContent=`${number(t.ramUsedMB===null?null:t.ramUsedMB/1024)} / ${number(t.ramTotalMB===null?null:t.ramTotalMB/1024)} GB`;
    el('fleetRamPercent').textContent=`${number(t.ramPercent,'%')} of combined capacity`;
    el('fleetAvailability').textContent=`${t.online}/${t.servers} servers reporting. Totals remain unavailable when a required reading is stale.`;
  }

  function renderWorker(worker, prefix='worker') {
    // Fleet rows may include hosts without a dedicated detail panel.
    if (!document.getElementById(prefix+'Connection')) return;
    if(prefix==='worker')lastWorker=worker;else if(prefix==='aus')lastAus=worker;else if(prefix==='eu2')lastEu2=worker;else lastGermany=worker;
    const el=id=>document.getElementById(id.replace(/^worker/,prefix));
    const s=worker?.sample;
    el('workerConnection').textContent=!worker?.configured?'Not configured':worker.online?(worker.status==='delayed'?'Monitoring delayed · last sample retained':'Connected'):'Monitoring unavailable';
    el('workerError').textContent=worker?.error||'';
    if(!s)return;
    el('workerFreshness').textContent=`${Date.now()-Date.parse(s.at)>30000?'STALE — ':''}Sample: ${new Date(s.at).toLocaleString()}`;
    el('workerCpu').textContent=number(s.cpu,'%');el('workerCores').textContent=`${s.logicalCpus} logical processors`;
    el('workerMemory').textContent=`${number(s.ramUsedMB/1024)} / ${number(s.ramTotalMB/1024)} GB`;
    el('workerDisk').textContent=`Disk free ${number(s.diskFreeGB)} GB`;
    el('workerHunts').textContent=s.hunts.filter(h=>!['city','dojo'].includes(h.kind)).length;
    el('workerUptime').textContent=`Host uptime ${duration(s.hostUptimeSeconds)}`;
    table(prefix+'Services',[['Worker monitor',worker.online?'Up':'Unavailable'],['Hunt deployment',s.role==='key-bot-storage'?'Not hosted':s.services.deploy?'Up':'Unavailable'],['Shared backend connection',s.services.backend?'Up':'Unavailable'],['Player allowlist',s.role==='key-bot-storage'?'Not hosted':s.services.allowlist?'Up':'Unavailable']]);
    const f=s.firewall;
    el('workerFirewall').textContent=f?`UDP ${f.ports} · ${f.addresses} authenticated addresses · Firewall ${f.ok===false?'update failed':f.enabled?'open for allowed players':'closed'}${f.pending?' · update pending':''}`:s.role==='key-bot-storage'?`Backup: ${s.backup?.verified?'verified':'not verified'} · ${s.backup?.at ? new Date(s.backup.at).toLocaleString():'no successful copy'}`:'Firewall state unavailable';
    for(const id of ['CpuChart','RamChart'])graph(prefix+id,(worker.history||[]).map(row=>({...row,[prefix+id]:row['worker'+id]})));
    const p=s.processes;
    el('workerProcessFreshness').textContent=p?`${Date.now()-Date.parse(p.at)>150000?'STALE — ':''}Process sample: ${new Date(p.at).toLocaleString()}`:'Waiting for process sample';
    el('workerNetwork').textContent=p?`Network in ${number(p.netInKbit)} / out ${number(p.netOutKbit)} kbit/s`:'';
    table(prefix+'ProcessRows',(p?.processes||[]).map(v=>[v.role,`${v.pid} / ${v.port??'—'}`,number(v.cpuPercent,'%'),number(v.workingSetMB,' MB'),number(v.privateMB,' MB'),duration((Date.now()-Date.parse(v.startedAt))/1000)]));
    table(prefix+'HuntRows',s.hunts.map(v=>[v.huntId||v.kind,v.port,v.expectedPlayers,duration((Date.now()-Date.parse(v.startedAt))/1000)]));
  }

  function list(id, values) { el(id).replaceChildren(...values.map(text => { const item = document.createElement('li'); item.textContent = text; return item; })); }
  async function refresh() {
    if (!key || busy || document.hidden) return;
    busy = true;
    try {
      const result = await get('/api/status');
      el('error').textContent = result.error || '';
      renderDiscord(result.sample?.discord);

      renderFleet(result.fleet);

      renderWorker(result.worker);
      renderWorker(result.aus,'aus');
      renderWorker(result.germany,'germany');
      renderWorker(result.eu2,'eu2');
      for(const name of ['worker','aus','germany','eu2']) {const tab=document.querySelector?.(`[data-view="${name}"]`);if(tab)tab.hidden=!result[name]?.configured;}
      el('login').hidden = true; el('data').hidden = false; if (el('menuToggle')) el('menuToggle').hidden = false;
      void refreshDrain();
      void refreshFleetDrain();
      void refreshLiveHosts();
      void refreshIslandEvent();
      void support?.refresh();
      el('invites').hidden = !result.invitesEnabled;
      el('invitesUnavailable').hidden = result.invitesEnabled;
      el('connection').textContent = result.error ? 'Backend unavailable · stale' : 'Connected · private access';
      const s = result.sample;
      if (s) {
        lastSample = s;
        el('serverName').textContent = s.name || 'Owner dashboard';
        el('fleetPlayers').textContent=s.players.length;
        el('fleetAccounts').textContent=s.accounts ?? '—';
        el('fleetLocations').textContent=`Ramsgate ${s.locations.city ?? 0} · Hunts ${s.locations.hunt ?? 0} · Menu ${s.locations.menu ?? 0}`;
        el('onlineValue').textContent = s.players.length;
        el('cityValue').textContent = `Ramsgate ${s.locations.city} · Hunts ${s.locations.hunt}`;
        el('cpuValue').textContent = number(s.cpu, '%'); el('coresValue').textContent = `${s.logicalCpus} logical processors`;
        el('ramValue').textContent = `${number(s.ramUsedMB / 1024)} / ${number(s.ramTotalMB / 1024)} GB`;
        el('ramFreeValue').textContent = `Free ${number((s.ramTotalMB - s.ramUsedMB) / 1024)} GB`;
        el('accountValue').textContent = s.accounts; el('newValue').textContent = `${s.newAccountsObserved} observed additions since startup`;
        el('freshness').textContent = `Last successful sample: ${new Date(s.at).toLocaleString()}`;
        for (const id of charts) graph(id, s.history);
        const r = s.health?.requests;
        el('health').textContent = r ? `Last 60 seconds: ${r.completed} responses · ${r.clientErrors} client errors · ${r.serverErrors} server errors · ${r.aborted} aborted · latency upper bounds p50 ${r.latencyP50UpperMs ?? 'n/a'} ms / p95 ${r.latencyP95UpperMs ?? 'n/a'} ms` : 'Waiting for backend health readings.';
        el('healthError').textContent = s.healthError || '';
        el('locations').textContent = `Ramsgate: ${s.locations.city} · Hunts: ${s.locations.hunt} · Dojo: ${s.locations.dojo} · Tutorial: ${s.locations.tutorial} · Menu: ${s.locations.menu} · Unknown: ${s.locations.unknown}`;
        el('uptimes').textContent = `VPS uptime: ${duration(s.hostUptimeSeconds)} · Backend: ${duration(s.uptimeSeconds)} · Dashboard: ${duration(s.dashboardUptimeSeconds)}`;
        list('playerList', s.players.length ? s.players.map(player => `${player.name} — ${player.where}`) : ['No players online']);
        list('worldList', s.instances.length ? s.instances.map(world => `${world.title}: ${world.players}/${world.maxPlayers}`) : ['No registered worlds']);
        const perf = s.performance;
        el('performanceStatus').textContent = perf ? `${perf.stale || Date.now() - Date.parse(perf.at) > 150000 ? 'STALE — ' : ''}Sample: ${new Date(perf.at).toLocaleString()} · collected approximately once per minute` : 'Performance log unavailable. Configure DASHBOARD_PERFORMANCE_DIR and enable the kit sampler.';
        el('hostExtra').textContent = perf ? `Disk free ${number(perf.host.disk_free_gb)} GB · Network in ${number(perf.host.net_in_kbit_s)} / out ${number(perf.host.net_out_kbit_s)} kbit/s` : '';
        table('processRows', (perf?.processes || []).map(p => [p.role, `${p.pid ?? '—'} / ${p.udp_port ?? '—'}`, number(p.cpu_host_percent, '%'), number(p.working_set_mb, ' MB'), number(p.private_mb, ' MB'), duration((Date.now() - Date.parse(p.started_utc)) / 1000)]));
      }
      if (el('logs').options.length === 0) for (const name of result.logNames) { const option = document.createElement('option'); option.textContent = name; option.value = name; el('logs').append(option); }
    } catch (error) { el('connection').textContent = 'Disconnected · readings stale'; el('error').textContent = `${error.message} Displayed readings may be stale.`; }
    finally { busy = false; }
  }
  async function refreshDrain() {
    try {
      const state = (await get('/api/drain')).state;
      el('drainStatus').textContent = state === 'dashboard' ? 'Draining this host.' : state === 'external' ? 'This host is draining under another controller.' : 'No maintenance drain is active on this host.';
      el('startDrain').disabled = state !== 'open';
      el('stopDrain').disabled = state !== 'dashboard';
    } catch {
      el('drainStatus').textContent = 'Local drain control is not configured or unavailable.';
      el('startDrain').disabled = true; el('stopDrain').disabled = true;
    }
  }
  async function refreshFleetDrain() {
    try {
      const hosts = (await get('/api/fleet-drain')).hosts;
      el('fleetDrainStatus').textContent = fleetDrainResult || (hosts.length ? `Configured: ${hosts.join(', ')}. Results appear after an action.` : 'Fleet drain is not configured.');
      el('startFleetDrain').disabled = !hosts.length; el('stopFleetDrain').disabled = !hosts.length;
    } catch {
      el('fleetDrainStatus').textContent = 'Fleet drain control is unavailable.';
      el('startFleetDrain').disabled = true; el('stopFleetDrain').disabled = true;
    }
  }
  async function refreshIslandEvent() {
    try {
      const result = await get('/api/island-event');
      el('islandEventStatus').textContent = result.configured ? `Mode: ${result.mode}. ${result.enabled ? 'Island events are advertised.' : 'Island events are not advertised.'}` : 'Island event control is not configured.';
      el('islandEventMode').value = result.mode || 'default';
      el('applyIslandEvent').disabled = !result.configured;
    } catch { el('islandEventStatus').textContent = 'Island event control unavailable.'; el('applyIslandEvent').disabled = true; }
  }
  el('applyIslandEvent').onclick = async () => {
    if (!key || !confirm('Apply the selected island event schedule?')) return;
    el('applyIslandEvent').disabled = true;
    try {
      const response = await fetch('/api/island-event', {method:'POST',headers:{'x-dashboard-key':key,'content-type':'application/json'},body:JSON.stringify({mode:el('islandEventMode').value}),signal:AbortSignal.timeout(10000)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Island event control unavailable.');
      await refreshIslandEvent();
    } catch (error) { el('islandEventStatus').textContent = error.message; el('applyIslandEvent').disabled = false; }
  };
  for (const [id, action] of [['startFleetDrain','start'], ['stopFleetDrain','stop']]) el(id).onclick = async () => {
    if (!key || !confirm(action === 'start' ? 'Drain all configured game hosts?' : 'Resume admission on all configured game hosts?')) return;
    el('startFleetDrain').disabled = true; el('stopFleetDrain').disabled = true;
    try {
      const response = await fetch('/api/fleet-drain', {method:'POST', headers:{'x-dashboard-key':key,'content-type':'application/json'}, body:JSON.stringify({action}), signal:AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error('Fleet action failed; check each host before retrying.');
      const result = await response.json();
      fleetDrainResult = result.hosts.map(host=>`${host.name}: ${host.state}`).join(' · ');
      el('fleetDrainStatus').textContent = fleetDrainResult;
    } catch (error) { fleetDrainResult = error.message; el('fleetDrainStatus').textContent = fleetDrainResult; }
    finally { el('startFleetDrain').disabled = false; el('stopFleetDrain').disabled = false; }
  };
  for (const [id, action] of [['startDrain','start'], ['stopDrain','stop']]) el(id).onclick = async () => {
    if (!key || !confirm(action === 'start' ? 'Stop admitting new hunts on this host?' : 'Resume hunt admission on this host?')) return;
    el('startDrain').disabled = true; el('stopDrain').disabled = true;
    try {
      const response = await fetch('/api/drain', {method:'POST', headers:{'x-dashboard-key':key,'content-type':'application/json'}, body:JSON.stringify({action}), signal:AbortSignal.timeout(10000)});
      if (!response.ok) throw new Error('Drain change failed; check status before retrying.');
      await refreshDrain();
    } catch (error) { el('drainStatus').textContent = error.message; }
  };
  el('connect').onclick = () => { key = el('key').value.trim(); el('key').value = ''; refresh(); };
  el('key').onkeydown = event => { if (event.key === 'Enter') el('connect').click(); };
  el('keyFile').onchange = async () => { const file = el('keyFile').files[0]; if (!file) return; if (file.size > 4096) { el('error').textContent = 'Select the small owner.key text file, not a backup archive.'; return; } key = (await file.text()).trim(); el('keyFile').value = ''; refresh(); };
  el('logout').onclick = () => { key = ''; location.reload(); };
  el('sendAnnouncement').onclick = async () => {
    const message = el('announcementText').value.trim();
    if (!key || !message || !confirm('Send this message to all connected chat sessions?')) return;
    el('sendAnnouncement').disabled = true;
    try {
      const response=await fetch('/api/announcement',{method:'POST',headers:{'x-dashboard-key':key,'content-type':'application/json'},body:JSON.stringify({message}),signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error || 'Announcement unavailable.');
      el('announcementStatus').textContent = `Sent to ${result.attempted} chat sessions. In-game display has not been verified.`;
    } catch(error) { el('announcementStatus').textContent = error.message || 'Result unknown; check before retrying.'; }
    finally {el('sendAnnouncement').disabled = false;}
  };
  for (const button of document.querySelectorAll('[data-view]')) button.onclick = () => {
    for (const panel of document.querySelectorAll('.view')) panel.hidden = panel.id !== button.dataset.view;
    for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed', String(tab === button));
    if (lastSample) for (const id of charts) graph(id, lastSample.history);
    if (button.dataset.view === 'overview')for(const id of fleetCharts)graph(id,fleetHistory);
    if (button.dataset.view === 'people') loadAccounts();
    if (button.dataset.view === 'support')void support?.refresh(true);
    if (button.dataset.view === 'worker' && lastWorker) renderWorker(lastWorker);
    if (button.dataset.view === 'aus' && lastAus) renderWorker(lastAus,'aus');
    if (button.dataset.view === 'germany' && lastGermany) renderWorker(lastGermany,'germany');
    if (button.dataset.view === 'eu2' && lastEu2) renderWorker(lastEu2,'eu2');
  };
  function showAccounts() {
    const query = el('accountSearch').value.trim().toLowerCase();
    const visible=accountPage.filter(a => `${a.name} ${a.id} ${a.keyFingerprint || ''}`.toLowerCase().includes(query));
    table('accountRows',visible.map(a => [a.name,a.id,a.developer?'Server Developer':a.admin?'Administrator':'Player',a.keyFingerprint || 'No active key']));
    Array.from(el('accountRows').children).forEach((row,i)=>{
      const account=visible[i],cell=row.children[3];
      const select=document.createElement('button');select.textContent='Manage account';
      select.onclick=()=>{el('accessAccount').value=account.id;el('accessDiscord').value=account.discordId??'';el('moderationAccount').value=account.id;};
      row.children[1].append(document.createTextNode(' '),select);
      const reward=document.createElement('button');reward.textContent='Give rewards';reward.onclick=()=>window.selectRewardAccount?.(account);row.children[1].append(document.createTextNode(' '),reward);
      if(account.discordId)row.children[2].append(document.createTextNode(' · Discord '+account.discordId));
      const reveal=document.createElement('button');reveal.textContent='Show login key';
      reveal.onclick=async()=>{
        reveal.disabled=true;
        try {
          const result=await get('/api/account-key?accountId='+encodeURIComponent(account.id));
          cell.textContent=result.key || 'No recovery copy yet. Original keys were stored as hashes; a successful launcher sign-in saves a recovery copy.';
        } catch {cell.textContent='Recovery unavailable. Try again.';}
      };
      cell.append(document.createTextNode(' '),reveal);
      if(!visible[i]?.developer)return;
      row.classList.add('developer-row');
      const role=row.children[2];role.textContent='';
      for(const [text,cls] of [['[ ','developer-bracket'],['Server Developer','developer-label'],[' ]','developer-bracket']]){
        const span=document.createElement('span');span.textContent=text;span.className=cls;role.appendChild(span);
      }
    });
  }
  let pendingAccountSearch=false, searchTimer;
  async function loadAccounts() {
    if (!key) return;
    if (accountsBusy) { pendingAccountSearch=true; return; }
    accountsBusy = true; el('refreshAccounts').disabled = true;
    try { const result = await get(`/api/accounts?offset=${accountOffset}&q=${encodeURIComponent(el('accountSearch').value.trim())}`); accountPage = result.accounts; nextOffset = result.nextOffset; showAccounts(); el('accountStatus').textContent = `Accounts ${accountOffset + (accountPage.length ? 1 : 0)}–${accountOffset + accountPage.length}. Search covers all accounts.`; }
    catch (error) { accountPage = []; nextOffset = null; showAccounts(); el('accountStatus').textContent = `${error.message} Account directory may require a backend update.`; }
    finally { accountsBusy = false; el('refreshAccounts').disabled = false; el('previousAccounts').disabled = accountOffset === 0; el('nextAccounts').disabled = nextOffset === null; if(pendingAccountSearch){pendingAccountSearch=false;void loadAccounts();} }
  }
  el('accountSearch').oninput = () => {accountOffset=0;clearTimeout(searchTimer);searchTimer=setTimeout(loadAccounts,300);};
  el('loadModeration').onclick = async () => {
    try {const info=await get(`/api/moderation?accountId=${encodeURIComponent(el('moderationAccount').value.trim())}`);el('moderationInfo').textContent=JSON.stringify(info,null,2);el('moderationStatus').textContent='Current moderation status loaded.';}
    catch(error){el('moderationStatus').textContent=error.message;}
  };
  async function moderate(active){
    const accountId=el('moderationAccount').value.trim(),reason=el('banReason').value.trim();
    if(!accountId || !reason){el('moderationStatus').textContent='Account ID and reason are required.';return;}
    el('banAccount').disabled=el('unbanAccount').disabled=true;
    try {
      const response=await fetch('/api/moderation',{method:'POST',headers:{'x-dashboard-key':key,'content-type':'application/json'},body:JSON.stringify({accountId,reason,active,includeDevice:active && el('banDevice').checked,includeIp:active && el('banIp').checked,...(active?{durationHours:Number(el('banDuration').value)}:{})}),signal:AbortSignal.timeout(65000)});
      const result=await response.json();if(!response.ok)throw Error(result.error || 'Moderation failed');
      el('moderationInfo').textContent=JSON.stringify(result,null,2);el('moderationStatus').textContent=active?'Player banned. Reason will appear in the launcher.':'Player unbanned.';
      void loadModerationLog('bans');void loadModerationLog('events');
    }catch(error){el('moderationStatus').textContent=error.message;}
    finally{el('banAccount').disabled=el('unbanAccount').disabled=false;}
  }
  el('banAccount').onclick=()=>moderate(true);
  el('unbanAccount').onclick=()=>moderate(false);
  const moderationOffsets={bans:null,events:null};
  async function loadModerationLog(kind,append=false){
    const tbody=el(kind==='bans'?'banRows':'moderationRows'),more=el(kind==='bans'?'moreBans':'moreModerationLog');
    more.disabled=true;
    try {
      const result=await get(`/api/moderation-log?kind=${kind}&offset=${append?(moderationOffsets[kind]??0):0}`);
      if(!append)tbody.replaceChildren();
      for(const row of result.rows){
        const tr=document.createElement('tr');
        const expires=row.expires_at?new Date(row.expires_at).toLocaleString():'Permanent';
        const values=kind==='bans'?[`${row.username??'Unknown'} / ${row.account_id}`,row.reason,expires]:[new Date(row.created_at).toLocaleString(),`${row.username??'Unknown'} / ${row.account_id}`,row.active?'Ban issued':'Ban revoked',row.reason,row.active?expires:'—',row.actor];
        for(const value of values){const td=document.createElement('td');td.textContent=value;tr.append(td);}
        if(kind==='bans'){const td=document.createElement('td'),button=document.createElement('button');button.textContent='Select for review / revoke';button.onclick=()=>{el('moderationAccount').value=row.account_id;el('loadModeration').click();};td.append(button);tr.append(td);}
        tbody.append(tr);
      }
      moderationOffsets[kind]=result.nextOffset;more.disabled=result.nextOffset===null;
      el('moderationListStatus').textContent='Moderation records loaded. Expired suspensions no longer block login.';
    }catch(error){el('moderationListStatus').textContent=error.message;}
  }
  el('refreshBans').onclick=()=>loadModerationLog('bans');
  el('refreshModerationLog').onclick=()=>loadModerationLog('events');
  el('moreBans').onclick=()=>loadModerationLog('bans',true);
  el('moreModerationLog').onclick=()=>loadModerationLog('events',true);
  async function accessPost(route,body){
    const response=await fetch(route,{method:'POST',headers:{'x-dashboard-key':key,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(65000)});
    const result=await response.json();if(!response.ok)throw Error(result.error??'Access request failed');return result;
  }
  async function showDiscordAccess(){
    const result=await get('/api/discord-access?discordId='+encodeURIComponent(el('accessDiscord').value.trim()));
    if(result.invite)result.invite={status:result.invite.status};
    el('accessInfo').textContent=JSON.stringify(result,null,2);return result;
  }
  el('loadDiscordAccess').onclick=()=>showDiscordAccess().catch(e=>{el('accessStatus').textContent=e.message;});
  el('manageAccess').onclick=async()=>{
    const action=el('accessAction').value;
    if(!el('accessReason').value.trim()){el('accessStatus').textContent='A reason is required.';return;}
    if(!confirm('Apply '+action+'? Login key changes sign out existing sessions.'))return;
    el('manageAccess').disabled=true;el('replacementKey').value='';
    try{
      const result=await accessPost('/api/account-access',{action,accountId:el('accessAccount').value.trim(),discordId:el('accessDiscord').value.trim(),reason:el('accessReason').value.trim()});
      el('replacementKey').value=result.key??'';
      el('accessStatus').textContent=result.key?'Replacement key created. Copy it privately; previous credentials and sessions are invalid.':'Account access updated. Progression preserved.';
      void loadAccounts();
    }catch(e){el('accessStatus').textContent=e.message;}
    finally{el('manageAccess').disabled=false;}
  };
  async function discordModerate(active){
    if(!el('accessReason').value.trim()){el('accessStatus').textContent='A reason is required.';return;}
    if(!confirm((active?'Ban':'Unban')+' this Discord account and linked game account?'))return;
    el('banDiscord').disabled=el('unbanDiscord').disabled=true;
    try{
      await accessPost('/api/discord-moderation',{discordId:el('accessDiscord').value.trim(),guildId:el('accessGuild').value.trim(),reason:el('accessReason').value.trim(),active,includeIp:active&&el('discordBanIp').checked});
      await showDiscordAccess();
      el('accessStatus').textContent='Game access updated. Discord action saved for the bot; refresh status to confirm.';
    }catch(e){el('accessStatus').textContent=e.message;}
    finally{el('banDiscord').disabled=el('unbanDiscord').disabled=false;}
  }
  el('banDiscord').onclick=()=>discordModerate(true);
  el('unbanDiscord').onclick=()=>discordModerate(false);
  el('copyReplacementKey').onclick=async()=>{
    if(!el('replacementKey').value)return;
    try{await navigator.clipboard.writeText(el('replacementKey').value);el('accessStatus').textContent='Key copied. Share privately with the account owner.';}
    catch{el('accessStatus').textContent='Clipboard unavailable.';}
  };
  el('refreshAccessLog').onclick=async()=>{
    try{el('accessLog').textContent=JSON.stringify((await get('/api/access-log')).rows,null,2);}
    catch(e){el('accessStatus').textContent=e.message;}
  };
  el('refreshAccounts').onclick = loadAccounts;
  el('nextAccounts').onclick = () => { if (!accountsBusy && nextOffset !== null) { accountOffset = nextOffset; loadAccounts(); } };
  el('previousAccounts').onclick = () => { if (!accountsBusy) { accountOffset = Math.max(0, accountOffset - 100); loadAccounts(); } };
  el('identifyKey').onclick = async () => {
    const value = el('matchKey').value.trim(); el('matchKey').value = '';
    if (!value) return;
    try { const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); const fingerprint = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16); el('matchResult').textContent = `Fingerprint: ${fingerprint}. Computed in this browser; the key was not sent. Compare against the account list.`; el('accountSearch').value = fingerprint; accountOffset=0; loadAccounts(); }
    catch { el('matchResult').textContent = 'Local hashing unavailable. Use the dashboard through localhost.'; }
  };
  el('createInvite').onclick = async () => {
    if (!key) return;
    el('createInvite').disabled = true; el('copyInvite').disabled = true; el('inviteLink').value = '';
    el('inviteStatus').textContent = 'Creating invite…';
    try {
      const response = await fetch('/api/invites', {method: 'POST', headers: {'x-dashboard-key': key, 'content-type': 'application/json'}, body: JSON.stringify({name: el('inviteName').value.trim(), uses: Number(el('inviteUses').value),...(el('inviteDiscord').value.trim()?{discordId:el('inviteDiscord').value.trim()}:{})}), signal: AbortSignal.timeout(20000)});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Invite request refused (${response.status}).`);
      el('inviteLink').value = result.invite; el('copyInvite').disabled = false;
      el('inviteStatus').textContent = `Ready: ${result.uses} account registration(s).`;
    } catch (error) { el('inviteStatus').textContent = `${error.message} A timed-out request may have created an invite; do not retry blindly.`; }
    finally { el('createInvite').disabled = false; }
  };
  el('copyInvite').onclick = async () => {
    try { await navigator.clipboard.writeText(el('inviteLink').value); el('inviteStatus').textContent = 'Link copied.'; }
    catch { el('inviteLink').select(); el('inviteStatus').textContent = 'Press Ctrl+C to copy the selected link.'; }
  };
  el('refreshLog').onclick = async () => { if (!key || !el('logs').value) return; try { el('logText').textContent = (await get(`/api/log?name=${encodeURIComponent(el('logs').value)}`)).text; } catch (error) { el('logText').textContent = error.message; } };
  setInterval(refresh, 5000);
  document.addEventListener('visibilitychange', refresh);
})();
