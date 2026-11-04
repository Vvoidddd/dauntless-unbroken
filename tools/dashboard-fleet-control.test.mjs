import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drainFleet } from './dashboard-fleet-control.mjs';

test('fleet reports each host independently without retrying ambiguous failures', async () => {
  const calls = [];
  const result = await drainFleet('start', [
    {name:'first', url:'http://127.0.0.1:61111', key:'first-control-key-long-enough-12345'},
    {name:'second', url:'http://127.0.0.1:61112', key:'second-control-key-long-enough-12345'}
  ], async (url, options) => {
    calls.push({url:String(url), key:options.headers['x-worker-control-key'], body:options.body});
    if (url.port === '61112') throw new Error('timeout');
    return Response.json({state:'dashboard'});
  });
  assert.deepEqual(result, [{name:'first', state:'dashboard'}, {name:'second', state:'unknown'}]);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => JSON.parse(call.body)), [{action:'start'}, {action:'start'}]);
  assert.ok(!JSON.stringify(result).includes('control-key'));
});

test('fleet rejects non-loopback targets and invalid actions', async () => {
  await assert.rejects(drainFleet('start', [{name:'outside',url:'http://example.com',key:'a'.repeat(32)}]), /loopback/);
  await assert.rejects(drainFleet('restart', []), /action/);
});
