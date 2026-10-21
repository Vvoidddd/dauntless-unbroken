import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newsEntry} from './publish-launcher-news.mjs';
test('news only reports main pushes or final launcher releases, bounded plain text and no false deployment claim',()=>{
  assert.equal(newsEntry({ref:'refs/heads/launcher-news',commits:[{message:'foo'}]},'push'),null);
  assert.equal(newsEntry({release:{tag_name:'server-v1',body:'x'}},'release'),null);
  assert.equal(newsEntry({release:{tag_name:'launcher-v1.0.20',prerelease:true}},'release'),null);
  const release=newsEntry({release:{tag_name:'launcher-v1.0.20',published_at:'2026-10-21',body:'Fixes'}},'release');
  assert.equal(release.title,'Launcher 1.0.20 is available');
  const push=newsEntry({ref:'refs/heads/main',after:'abc',commits:[{message:'Fix parties\nInternal details'},{message:'Fix parties'},{message:'ci: checks'}]},'push');
  assert.ok(push.body.includes('Fix parties'));assert.ok(!push.body.includes('Internal details'));assert.ok(push.body.includes('after a tested build'));
});
