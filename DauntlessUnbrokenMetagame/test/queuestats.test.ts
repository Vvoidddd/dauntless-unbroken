import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EstimateQueueWait} from '../src/controllers/queuestats';
test('queue estimates need sustained, recent admissions and never count a party four times',()=>{
 assert.equal(EstimateQueueWait([],2,100000),null);
 assert.equal(EstimateQueueWait([0,0,0,0],2,100000),null);
 assert.equal(EstimateQueueWait([0,1000,2000,3000],2,100000),null);
 assert.equal(EstimateQueueWait([0,30000,60000,90000],2,100000),90);
 assert.equal(EstimateQueueWait([0,30000,60000,90000,90000],0,100000),30);
 assert.equal(EstimateQueueWait([0,30000,60000,90000],2,220001),null);
 assert.equal(EstimateQueueWait([NaN,Infinity,110000],0,100000),null);
});
