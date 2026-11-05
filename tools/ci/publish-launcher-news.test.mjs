import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newsEntry, publishedRelease} from './publish-launcher-news.mjs';
test('news only reports 1.10.5 pushes or final launcher releases, bounded plain text and no false deployment claim',()=>{
  assert.equal(newsEntry({ref:'refs/heads/launcher-news',commits:[{message:'foo'}]},'push'),null);
  assert.equal(newsEntry({release:{tag_name:'server-v1',body:'x'}},'release'),null);
  assert.equal(newsEntry({release:{tag_name:'launcher-v1.0.20',prerelease:true}},'release'),null);
  const release=newsEntry({release:{tag_name:'launcher-v1.0.20',published_at:'2026-10-21',body:'Fixes'}},'release');
  assert.equal(release.title,'Launcher 1.0.20 is available');
  const push=newsEntry({ref:'refs/heads/1.10.5',after:'abc',commits:[{message:'Fix parties\nInternal details'},{message:'Fix parties'},{message:'ci: checks'}]},'push');
  assert.ok(push.body.includes('Fix parties'));assert.ok(!push.body.includes('Internal details'));assert.ok(push.body.includes('after a tested build'));
});

test('launcher news only runs in the public repository',()=>{
  for (const file of ['launcher-news.yml','launcher-release.yml']) {
    const workflow=fs.readFileSync(new URL(`../../.github/workflows/${file}`,import.meta.url),'utf8');
    if (file === 'launcher-news.yml') {
      assert.match(workflow,/publish:\s*\n\s+if:\s*github\.repository == 'Vvoidddd\/dauntless-unbroken'/);
    } else {
      assert.match(workflow,/news:\s*\n\s+name:[\s\S]*?if:\s*>-\s*\n[\s\S]*?github\.repository == 'Vvoidddd\/dauntless-unbroken'/);
    }
  }
});

test('published release lookup retries GitHub eventual consistency',async()=>{
  const responses=[
    {ok:false,status:404},
    {ok:true,json:async()=>({tag_name:'launcher-v1.0.57'})},
  ];
  const release=await publishedRelease('launcher-v1.0.57',async()=>responses.shift(),async()=>{});
  assert.equal(release.tag_name,'launcher-v1.0.57');
  assert.equal(responses.length,0);
});
