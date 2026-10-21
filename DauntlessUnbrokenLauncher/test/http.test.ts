import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { request, HttpError } from '../src/main/http';

test('an already-cancelled request rejects without opening a socket or crashing', async () => {
  const server = http.createServer((_req, res) => res.end('{}'));
  let connections = 0;
  server.on('connection', () => connections++);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(request({host:'127.0.0.1',port:(server.address() as import('node:net').AddressInfo).port,pin:null}, '/', {
      signal:controller.signal,timeoutMs:1000,maxBytes:64,
    }), (e: unknown) => e instanceof HttpError && e.kind === 'aborted');
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(connections, 0);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
