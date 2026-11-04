import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {SlowRequestDiagnostics, ParseSlowRequestThreshold} from '../src/middleware/SlowRequestDiagnostics';

test('slow and failed responses record safe completion data without request secrets', async () => {
  const events: unknown[] = [];
  const app = express();
  app.use(SlowRequestDiagnostics(0, event => events.push(event)));
  app.get('/test/:token', (_req, res) => res.status(503).end());
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as {port: number}).port;
    const result = await fetch(`http://127.0.0.1:${port}/test/secret-value?password=secret-value`, {headers:{authorization:'secret-value'}});
    assert.equal(result.status, 503);
    await result.text();
    assert.equal(events.length, 1);
    const data = events[0] as Record<string, unknown>;
    assert.equal(data.method, 'GET');
    assert.equal(data.route, '/test/:token');
    assert.equal(data.status, 503);
    assert.equal(data.outcome, 'finished');
    assert.ok(typeof data.durationMs === 'number' && data.durationMs >= 0);
    assert.doesNotMatch(JSON.stringify(data), /secret-value/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('threshold validates configuration', () => {
  assert.equal(ParseSlowRequestThreshold(undefined), undefined);
  assert.equal(ParseSlowRequestThreshold('250'), 250);
  for (const bad of ['', '-1', 'NaN', '1.5', '1e9']) assert.throws(() => ParseSlowRequestThreshold(bad));
});

test('fast success is suppressed and an aborted request is recorded once', async () => {
  const events: any[] = [];
  const app = express();
  app.use(SlowRequestDiagnostics(3600000, event => events.push(event)));
  app.get('/fast', (_req, res) => res.end());
  app.get('/wait', (_req, res) => { res.write('pending'); });
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const port = (server.address() as {port: number}).port;
    await (await fetch(`http://127.0.0.1:${port}/fast`)).text();
    assert.equal(events.length, 0);
    await new Promise<void>((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${port}/wait`, res => {
        res.once('data', () => { res.destroy(); resolve(); });
      });
      req.once('error', reject);
    });
    for (let i = 0; i < 50 && events.length === 0; ++i) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'aborted');
    assert.equal(events[0].route, '/wait');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
