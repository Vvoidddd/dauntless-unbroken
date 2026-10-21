import { readFile } from 'node:fs/promises';

export async function loadInviteConfig(file) {
  if (!file) throw new Error('Configure SERVER_CONFIG_FILE for launcher invites');
  const config = JSON.parse(await readFile(file, 'utf8'));
  // Validate before the bot starts accepting claims.
  launcherInvite(config, 'VALIDATION');
  return config;
}

export function launcherInvite(config, code) {
  if (!/^[A-Za-z0-9-]{4,64}$/.test(code)) throw new Error('Registration code is not launcher compatible');
  if (config.Mode !== 'Public' || !/^[a-z0-9.-]{1,253}$/i.test(config.PublicHost || '') || !Number.isInteger(config.Ports?.gateway) || config.Ports.gateway < 1 || config.Ports.gateway > 65535 || !/^[a-f0-9]{64}$/i.test(config.CertFingerprint || '')) throw new Error('Invalid public server configuration');
  const query = new URLSearchParams({v:'2',mode:'public',host:config.PublicHost.toLowerCase(),port:String(config.Ports.gateway),fp:config.CertFingerprint.toLowerCase(),code,name:config.ServerName || 'Dauntless Unbroken'});
  return `dauntless-unbroken://join?${query}`;
}

export function inviteMessage(config, code) {
  return ['🔑 **Your Dauntless Unbroken Invite**', '```', launcherInvite(config,code), '```',
    "Paste the complete invite into the launcher's Join box, then choose a username on Register. The launcher saves an account-key backup to your Desktop.",
    'Already registered? Use /key resend for your verified account key, or import your PC Desktop backup on your Steam Deck. Do not register a new save.',
    'This invite/account is linked to your Discord account. Keep the key private: if another player misuses it, your access/key may also be revoked.',
    '**Clear skies, Slayer.**'].join('\n');
}

export function accountKeyBackup(config,key,username) {
  launcherInvite(config,'VALIDATION');
  if(!/^UUK_[A-Za-z0-9_-]{16,128}$/.test(key))throw Error('Invalid account key');
  return ['Dauntless Unbroken account key','',`Server: ${String(config.ServerName||'Dauntless Unbroken').replace(/[\r\n]/g,' ').slice(0,64)} (${config.PublicHost.toLowerCase()}:${config.Ports.gateway})`,
    `Certificate: ${config.CertFingerprint.toLowerCase()}`,`Username: ${String(username||'-').replace(/[\r\n]/g,' ').slice(0,64)}`,`Key: ${key}`,'',
    'Keep this file private. This key is linked to your Discord account; misuse by another player may also cause your key/access to be revoked.',
    'On your Steam Deck or other PC, open the launcher and choose Import account backup. Do not register again.',''].join('\r\n');
}
