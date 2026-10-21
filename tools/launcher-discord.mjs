import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'Vvoidddd/dauntless-unbroken';
const BRAND = 'Dauntless Unbroken Launcher';
const ICON = `https://raw.githubusercontent.com/${REPOSITORY}/main/DauntlessUnbrokenLauncher/src/renderer/brand/emblem-512.png`;
const VERSION = /^launcher-v(\d+\.\d+\.\d+)$/;

export function launcherBuild(release) {
  const match = VERSION.exec(release?.tag_name ?? '');
  if (!match || release.draft || release.prerelease || !release.published_at) return null;
  const page = `https://github.com/${REPOSITORY}/releases/tag/${release.tag_name}`;
  if (release.html_url !== page) return null;
  const installer = release.assets?.find(a => a.name === 'DauntlessUnbrokenLauncher-Setup.exe' && a.state === 'uploaded' && a.size > 0);
  const sums = release.assets?.find(a => a.name === 'SHA256SUMS.txt' && a.state === 'uploaded' && a.size > 0);
  if (!installer || !sums) return null;
  const prefix = `https://github.com/${REPOSITORY}/releases/download/${release.tag_name}/`;
  if (installer.browser_download_url !== prefix + installer.name || sums.browser_download_url !== prefix + sums.name) return null;
  return { release, version: match[1], page, installer, sums };
}

function compare(a, b) {
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}

export function announcement(build) {
  const fields = [
    { name: 'Latest version', value: `**${build.version}**`, inline: true },
    { name: 'Status', value: '🟢 Published', inline: true },
    { name: 'Platform', value: 'Windows x64', inline: true },
    { name: 'Windows installer', value: `[${build.installer.name}](${build.installer.browser_download_url})\n${(build.installer.size / 1024 / 1024).toFixed(1)} MiB`, inline: false },
    { name: 'Installing / updating', value: 'Run the setup EXE to install or update. Fully close the game before updating, then launch again.', inline: false },
  ];
  fields.push({ name: 'Downloads & verification', value: `[All downloads and release notes](${build.page}) · [SHA-256 checksums](${build.sums.browser_download_url})`, inline: false });
  return {
    username: BRAND, avatar_url: ICON, allowed_mentions: { parse: [] },
    embeds: [{ title: 'Dauntless Unbroken · Launcher', url: build.page, color: 0xB990FF,
      description: 'The latest published launcher build. This message updates automatically when a new version is released.',
      thumbnail: { url: ICON }, fields, timestamp: build.release.published_at,
      footer: { text: 'Launcher releases only · Automatically updated' } }],
    components: [{ type: 1, components: [
      { type: 2, style: 5, label: 'Download Setup.exe', url: build.installer.browser_download_url },
      { type: 2, style: 5, label: 'All downloads / release notes', url: build.page },
    ] }],
  };
}

export async function syncLauncher({ webhookUrl, messageId, githubToken, create = false, request = fetch }) {
  const webhook = new URL(webhookUrl);
  if (webhook.origin !== 'https://discord.com' || !/^\/api(?:\/v10)?\/webhooks\/\d+\/[\w-]+$/.test(webhook.pathname) || webhook.search || webhook.hash || webhook.username || webhook.password) throw Error('Invalid launcher webhook configuration');
  if (messageId && !/^\d{16,22}$/.test(messageId)) throw Error('Invalid launcher message ID');
  if (!messageId && !create) throw Error('Launcher message ID is not configured');
  async function json(url, options = {}) {
    let response;
    try { response = await request(url, { ...options, signal: AbortSignal.timeout(30000) }); }
    catch { throw Error('Launcher announcement request failed'); }
    if (!response.ok) throw Error(`Launcher announcement HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  const release = await json(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}) },
  });
  const build = launcherBuild(release);
  if (!build) return { action: 'skipped', reason: 'not a complete published stable launcher build' };
  const payload = announcement(build);
  const send = (url, method, body) => json(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!messageId) {
    const message = await send(webhook.href + '?wait=true&with_components=true', 'POST', payload);
    return { action: 'created', messageId: message.id, version: build.version };
  }
  const messageUrl = `${webhook.href}/messages/${messageId}`;
  const previous = await json(messageUrl);
  const oldUrl = previous.embeds?.[0]?.url;
  const oldVersion = oldUrl?.match(/\/launcher-v(\d+\.\d+\.\d+)$/)?.[1];
  if (oldVersion && compare(build.version, oldVersion) < 0) return { action: 'skipped', reason: 'older than announced build' };
  if (oldUrl === build.page) return { action: 'unchanged', messageId, version: build.version };
  const download = await send(webhook.href + '?wait=true&with_components=true', 'POST', {
    username: BRAND, avatar_url: ICON, allowed_mentions: { parse: [] },
    content: `🚀 **Launcher ${build.version} is published**\n[Download Setup.exe](${build.installer.browser_download_url}) · [Release notes](${build.page})\nUpdate the launcher, then fully restart the game.`,
    components: payload.components,
  });
  try {
    const { username, avatar_url, ...edit } = payload;
    await send(messageUrl + '?with_components=true', 'PATCH', edit);
  } catch (error) {
    // Keep a retry from announcing the same installer again after a definite edit failure.
    const state = await json(messageUrl).catch(() => null);
    if (state?.embeds?.[0]?.url === build.page) return { action: 'updated', messageId, downloadMessageId: download.id, version: build.version };
    await json(`${webhook.href}/messages/${download.id}`, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
  return { action: 'updated', messageId, downloadMessageId: download.id, version: build.version };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncLauncher({ webhookUrl: process.env.LAUNCHER_DISCORD_WEBHOOK_URL, messageId: process.env.LAUNCHER_DISCORD_MESSAGE_ID,
    githubToken: process.env.GH_TOKEN, create: process.argv.includes('--create') })
    .then(result => console.log(JSON.stringify(result)))
    .catch(() => { console.error('Launcher announcement failed; check webhook configuration and Discord/GitHub availability.'); process.exitCode = 1; });
}
