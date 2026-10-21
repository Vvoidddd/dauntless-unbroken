import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePurchaseHistory} from '../src/main/hostapi';
test('purchase history accepts bounded receipts and strips server-only fields',()=>{
 const receipt={id:'123',time:'2026-10-21T01:00:00Z',source:'vendor:granny',costs:[{catalogId:'CURRENCY_NOTES',quantity:100}],items:[{catalogId:'TONIC_BLITZ',quantity:1}],status:'delivered'};
 assert.deepEqual(parsePurchaseHistory({purchases:[{...receipt,tokenHash:'private'}],limit:500}),{purchases:[receipt],limit:50});
 for(const patch of [{time:'invalid'},{costs:[{catalogId:'CURRENCY_NOTES',quantity:-100}]},{items:Array(101).fill(receipt.items[0])},{status:'guaranteed'},{id:'invalid'}])
  assert.throws(()=>parsePurchaseHistory({purchases:[{...receipt,...patch}]}));
 assert.throws(()=>parsePurchaseHistory({purchases:Array(51).fill(receipt)}));
});
