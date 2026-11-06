import type {Snapshot} from './types';

// Public identity only. Never move credentials to this endpoint or change a stored certificate.
export function isUnbrokenFleet(server:Snapshot['server']):boolean {
 return server?.mode==='public'&&server.host==='5.83.134.32'&&server.port===443&&server.fingerprint==='997da5dfa16cf4d7e260fd3f19e0a53730578442f60b6b4057965c1f2780d07e';
}
export function revivedConnection(snap:Pick<Snapshot,'server'|'status'>):boolean {
 const name=snap.status?.name??snap.server?.name;
 return !!snap.server&&!isUnbrokenFleet(snap.server)&&typeof name==='string'&&/^dauntless[\s-]+revived$/i.test(name.trim());
}
