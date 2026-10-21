import {RemoveTestDb} from './setup';
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {GetDb} from '../src/db';
import {GetHuntRegion,SaveHuntRegion} from '../src/controllers/regionpreferences';
after(()=>RemoveTestDb(()=>GetDb().$client.close()));

test('saved preferences for retired regions use the shared pool without erasing the preference',()=>{
 const us=process.env.US_REGION,ger=process.env.GERMANY_REGION;
 try {
  process.env.US_REGION='0';process.env.GERMANY_REGION='0';
  const sql=GetDb().$client;
  for(const id of ['fallback-us','fallback-ger','fallback-aus'])sql.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES (?,?,0,0)').run(id,id);
  SaveHuntRegion('fallback-us','us');SaveHuntRegion('fallback-ger','ger');SaveHuntRegion('fallback-aus','aus');
  for(const id of ['fallback-us','fallback-ger','fallback-aus'])assert.equal(GetHuntRegion(id),'main');
  assert.equal((sql.prepare('SELECT region FROM huntregions WHERE userId=?').get('fallback-us') as {region:string}).region,'us');
  process.env.US_REGION='1';process.env.GERMANY_REGION='1';
  assert.equal(GetHuntRegion('fallback-us'),'us');assert.equal(GetHuntRegion('fallback-ger'),'ger');assert.equal(GetHuntRegion('fallback-aus'),'us');
 } finally {if(us===undefined)delete process.env.US_REGION;else process.env.US_REGION=us;if(ger===undefined)delete process.env.GERMANY_REGION;else process.env.GERMANY_REGION=ger;}
});
