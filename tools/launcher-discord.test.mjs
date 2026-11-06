import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { launcherBuild, announcement, syncLauncher, REPOSITORY } from './launcher-discord.mjs';

const webhookUrl = 'https://discord.com/api/webhooks/123456789012345678/test-token';
const messageId = '223456789012345678';
function release(version = '1.0.13') {
  const tag_name = 'launcher-v' + version;
  return { id: 42, tag_name, draft: false, prerelease: false, published_at: '2026-10-21T01:18:00Z',
    html_url: `https://github.com/${REPOSITORY}/releases/tag/${tag_name}`, body: '- Menu navigation\n- Discord button @everyone',
    assets: ['DauntlessUnbrokenLauncher-Setup.exe', 'SHA256SUMS.txt'].map(name => ({ name, size: name.endsWith('.exe') ? 197116928 : 1234, state: 'uploaded',
      browser_download_url: `https://github.com/${REPOSITORY}/releases/download/${tag_name}/${name}` })) };
}
function mock({ current = '1.0.12', next = '1.0.13', failEdit = false } = {}) {
  const calls = [];
  let message = announcement(launcherBuild(release(current)));
  const request = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    calls.push({ url, method, body: options.body && JSON.parse(options.body) });
    if (String(url).startsWith('https://api.github.com/')) return Response.json(release(next));
    if (method === 'GET') return Response.json({ id: messageId, ...message });
    if (method === 'POST') return Response.json({ id: '323456789012345678' });
    if (method === 'PATCH') {
      if (failEdit) return new Response(null, { status: 500 });
      message = JSON.parse(options.body);
      return Response.json({ id: messageId });
    }
    if (method === 'DELETE') return new Response(null, { status: 204 });
    throw Error('Unexpected test request');
  };
  return { calls, request };
}

test('only complete, published, stable launcher releases are eligible', () => {
  assert.equal(launcherBuild(release()).version, '1.0.13');
  for (const patch of [{ tag_name: 'launcher-updates' }, { tag_name: 'backend-v1.0.13' }, { draft: true }, { prerelease: true },
    { published_at: null }, { assets: [] }, { html_url: 'https://evil.example/release' }]) {
    assert.equal(launcherBuild({ ...release(), ...patch }), null);
  }
  const invalid = release(); invalid.assets[0].browser_download_url = 'https://evil.example/setup.exe';
  assert.equal(launcherBuild(invalid), null);
});

test('embed uses fixed branding, the versioned setup EXE, checksums and link buttons without pings', () => {
  const payload = announcement(launcherBuild(release()));
  assert.equal(payload.username, 'Dauntless Unbroken Launcher');
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(payload.embeds[0].fields[0].value, '**1.0.13**');
  assert.ok(payload.embeds[0].thumbnail.url.endsWith('behemoth-512.png'));
  assert.equal(payload.components[0].components[0].url, release().assets[0].browser_download_url);
  assert.ok(payload.components[0].components.every(button => button.style === 5));
});

test('bootstrap creates exactly one current-version embed with components enabled', async () => {
  const state = mock();
  const result = await syncLauncher({ webhookUrl, create: true, request: state.request });
  assert.equal(result.action, 'created');
  assert.equal(state.calls.filter(c => c.method === 'POST').length, 1);
  assert.ok(state.calls.at(-1).url.includes('wait=true&with_components=true'));
});

test('Linux downloads use only uploaded assets from the same release and fit Discord limits', () => {
  const next = release();
  for (const suffix of ['linux-x86_64.AppImage', 'linux-amd64.deb', 'linux-x86_64.rpm', 'linux-x64.tar.gz', 'linux-x64.zip']) {
    const name = `DauntlessUnbrokenLauncher-1.0.13-${suffix}`;
    next.assets.push({ name, size: 120000000, state: 'uploaded', browser_download_url: `https://github.com/${REPOSITORY}/releases/download/${next.tag_name}/${name}` });
  }
  const payload = announcement(launcherBuild(next));
  assert.equal(launcherBuild(next).linux.length, 5);
  assert.equal(payload.components[0].components.length, 3);
  assert.match(payload.embeds[0].fields.find(f => f.name === 'Platforms').value, /Linux.*Steam Deck/);
  assert.ok(payload.embeds[0].fields.every(f => f.name.length <= 256 && f.value.length <= 1024));
  assert.ok(JSON.stringify(payload).length < 6000);
  next.assets[2].browser_download_url = 'https://evil.example/game.AppImage';
  next.assets[3].state = 'new';
  next.assets[4].size = 0;
  assert.equal(launcherBuild(next).linux.length, 2);
  assert.equal(announcement(launcherBuild(next)).components[0].components.length, 2);
});

test('same-version legacy embeds refresh in place when Linux assets become available', async () => {
  const next = release();
  const name = 'DauntlessUnbrokenLauncher-1.0.13-linux-x86_64.AppImage';
  next.assets.push({ name, size: 120000000, state: 'uploaded', browser_download_url: `https://github.com/${REPOSITORY}/releases/download/${next.tag_name}/${name}` });
  let message = { embeds: [{ url: next.html_url }] }, edits = 0;
  const request = async (url, options = {}) => {
    if (String(url).startsWith('https://api.github.com/')) return Response.json(next);
    if (!options.method) return Response.json(message);
    assert.equal(options.method, 'PATCH');
    message = JSON.parse(options.body); edits++;
    return Response.json({ id: messageId });
  };
  assert.equal((await syncLauncher({ webhookUrl, messageId, request })).action, 'updated');
  assert.match(JSON.stringify(message), /linux-x86_64.AppImage/);
  assert.equal((await syncLauncher({ webhookUrl, messageId, request })).action, 'unchanged');
  assert.equal(edits, 1);
});

test('a new published launcher only edits the existing message, and reruns do not duplicate', async () => {
  const state = mock();
  const result = await syncLauncher({ webhookUrl, messageId, request: state.request });
  assert.equal(result.action, 'updated');
  assert.equal(state.calls.filter(c => c.method === 'POST').length, 0);
  assert.equal(state.calls.filter(c => c.method === 'PATCH').length, 1);
  assert.ok(state.calls.find(c => c.method === 'PATCH').url.includes('/messages/' + messageId));
  const calls = state.calls.length;
  assert.equal((await syncLauncher({ webhookUrl, messageId, request: state.request })).action, 'unchanged');
  assert.ok(state.calls.slice(calls).every(c => c.method === 'GET'));
});

test('same-version CI completions and older releases cannot send announcements', async () => {
  for (const [current, next] of [['1.0.13', '1.0.13'], ['1.0.14', '1.0.13']]) {
    const state = mock({ current, next });
    await syncLauncher({ webhookUrl, messageId, request: state.request });
    assert.ok(state.calls.every(c => c.method === 'GET'));
  }
});

test('an edit failure never posts a replacement or deletes the existing message', async () => {
  const state = mock({ failEdit: true });
  await assert.rejects(syncLauncher({ webhookUrl, messageId, request: state.request }), /HTTP 500/);
  assert.equal(state.calls.filter(c => c.method === 'POST').length, 0);
  assert.equal(state.calls.filter(c => c.method === 'DELETE').length, 0);
});

test('bad configuration fails before network requests, and transport errors do not expose the webhook', async () => {
  let calls = 0;
  const request = async () => { calls++; throw Error(webhookUrl); };
  await assert.rejects(syncLauncher({ webhookUrl: 'https://evil.example/webhook', messageId, request }), /Invalid/);
  await assert.rejects(syncLauncher({ webhookUrl, request }), /not configured/);
  assert.equal(calls, 0);
  await assert.rejects(syncLauncher({ webhookUrl, messageId, request }), error => error.message === 'Launcher announcement request failed');
});

test('workflow uses read-only permissions, trusted checkout and successful publisher completion', () => {
  const workflow = readFileSync(new URL('../.github/workflows/launcher-discord.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflows: \[CI, Launcher release\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.event != 'pull_request'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /^  (push|pull_request|pull_request_target):/m);
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /github\.event_name == 'push' && github\.ref_name == github\.event\.repository\.default_branch/);
  assert.doesNotMatch(ci, /refs\/heads\/main/);
});
