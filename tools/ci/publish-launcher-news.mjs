import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const clean = (s, max) => String(s ?? '').replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'').trim().slice(0,max);
export function newsEntry(event, kind, now = new Date()) {
  if(kind === 'release') {
    const r=event.release;
    if(!r || r.draft || r.prerelease || !/^launcher-v\d+\.\d+\.\d+$/.test(r.tag_name)) return null;
    return {id:r.tag_name,date:r.published_at || now.toISOString(),title:`Launcher ${r.tag_name.slice(10)} is available`,body:clean(r.body,6000)};
  }
  if(kind !== 'push' || event.deleted || event.ref !== 'refs/heads/main') return null;
  const messages=[...new Set((event.commits ?? []).map(c=>clean(c.message,2000).split('\n')[0]))]
    .filter(s=>s && !/^(merge |chore\(news\)|docs?:|test[s]?:|ci:)/i.test(s)).slice(0,8);
  if(!messages.length) return null;
  return {id:clean(event.after,64),date:now.toISOString(),title:'Latest project updates',
    body:messages.map(s=>'• '+s).join('\n')+'\n\nSource changes are published. Launcher changes become available after a tested build is released.'};
}

export async function publish(event, kind) {
  const item=newsEntry(event,kind); if(!item) return;
  const repo=process.env.GITHUB_REPOSITORY;
  if(repo !== 'Vvoidddd/dauntless-unbroken') throw Error('Unexpected repository');
  const api=async(route,method='GET',body)=>{
    const response=await fetch(`https://api.github.com/repos/${repo}/${route}`,{method,
      headers:{authorization:`Bearer ${process.env.GH_TOKEN}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28'},
      ...(body ? {body:JSON.stringify(body)} : {}),signal:AbortSignal.timeout(15000)});
    if(!response.ok) {const error=new Error(`News API HTTP ${response.status}`);error.status=response.status;throw error;}
    return response.json();
  };
  try { await api('git/ref/heads/launcher-news'); }
  catch(e) { if(e.status !== 404) throw e; const head=await api('git/ref/heads/main'); await api('git/refs','POST',{ref:'refs/heads/launcher-news',sha:head.object.sha}); }
  let previous,items=[];
  try { previous=await api('contents/news.json?ref=launcher-news'); items=JSON.parse(Buffer.from(previous.content,'base64').toString()).items ?? []; }
  catch(e) { if(e.status !== 404) throw e; }
  items=[item,...items.filter(x=>x.id !== item.id)].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,30);
  await api('contents/news.json','PUT',{message:'chore(news): refresh launcher feed',branch:'launcher-news',
    ...(previous ? {sha:previous.sha} : {}),content:Buffer.from(JSON.stringify({items},null,2)+'\n').toString('base64')});
  console.log('Launcher news updated');
}
if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if(process.argv[2] === '--release') {
    const tag=process.argv[3]; if(!/^launcher-v\d+\.\d+\.\d+$/.test(tag)) throw Error('Invalid launcher tag');
    const response=await fetch(`https://api.github.com/repos/Vvoidddd/dauntless-unbroken/releases/tags/${tag}`,{signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw Error('Published release unavailable');
    await publish({release:await response.json()},'release');
  } else await publish(JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),process.env.GITHUB_EVENT_NAME);
}
