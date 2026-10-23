// Account keys, one per server, stored only through Electron safeStorage (DPAPI on Windows, the desktop secret store on Linux).
// The key never goes to the renderer; it is read here when a request or the game launch needs it.
//
// A public server's key is tied to the certificate fingerprint it was saved with. An invite for the
// same host:port with another fingerprint (a rebuilt server, or someone in the middle) cannot
// load it: the key moves to a new fingerprint only through rebind(), after the user confirmed.

import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { isValidFingerprint, isValidHost, isPrivateModeHost, type Invite } from "../shared/invite";
import { isPlausibleAccountKey, extractAccountKey } from "../shared/username";
import { addSecret, removeSecret, log } from "./log";

export interface Encryptor {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(data: Buffer): string;
}

export class KeyStoreError extends Error {
  constructor(public readonly code: "unavailable" | "invalid") {
    super(code);
    this.name = "KeyStoreError";
  }
}

// One key per server. Private servers keep the plain host:port id; public servers get their own
// namespace, so a public and a private server on the same address never share a key.
export function serverId(host: string, port: number, mode: "private" | "public" = "private"): string {
  const id = mode === "public" ? `public:${host}:${port}` : `${host}:${port}`;
  return createHash("sha256").update(id).digest("hex").slice(0, 24);
}

export interface KeySlot {
  host: string;
  port: number;
  mode: "private" | "public";
  fp: string | null; // public mode: the certificate fingerprint the key belongs to
}

// What is inside a key file after decryption: "DRK2\n<fingerprint or ->\n<key>". The first
// format was the key alone; such a key is not tied to any certificate.
const FORMAT = "DRK2";

interface StoredKey {
  key: string;
  fp: string | null;
}

export class KeyStore {
  // One launcher process owns this store; serialize its infrequent key mutations.
  private pending: Promise<void> = Promise.resolve();
  private recoveryPending: Promise<void> = Promise.resolve();
  private recoveryQueued = new Map<string,string>();
  constructor(private readonly dir: string, private readonly crypto: Encryptor, private readonly recoveryDir?: string) {}

  private update<T>(work: () => Promise<T>): Promise<T> {
    const result = this.pending.then(work);
    this.pending = result.then(() => undefined, () => undefined);
    return result;
  }

  private file(slot: KeySlot): string {
    return path.join(this.dir, `${serverId(slot.host, slot.port, slot.mode)}.key`);
  }

  private async read(slot: KeySlot): Promise<StoredKey | null> {
    let data: Buffer;
    let recovery = false;
    try {
      data = await fsp.readFile(this.file(slot));
    } catch {
      if (!this.recoveryDir) return null;
      try {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const found = await Promise.race([
            this.recoveryPending.then(() => fsp.readFile(path.join(this.recoveryDir!, `${serverId(slot.host, slot.port, slot.mode)}.txt`))),
            new Promise<null>(resolve => { timer=setTimeout(()=>resolve(null),1500); }),
          ]);
          if (!found) return null;
          data=found;
        } finally { clearTimeout(timer); }
        recovery = true;
      } catch { return null; }
    }
    if (!recovery && !this.crypto.isAvailable()) throw new KeyStoreError("unavailable");
    let text: string;
    try {
      text = recovery ? data.toString("utf8") : this.crypto.decrypt(data);
    } catch {
      return null; // encrypted by another Windows user or PC
    }
    const parts = text.split("\n");
    if (parts.length === 3 && parts[0] === FORMAT) {
      const fp = parts[1] === "-" ? null : parts[1];
      if (fp !== null && !isValidFingerprint(fp)) return null;
      return isPlausibleAccountKey(parts[2]) ? { key: parts[2], fp } : null;
    }
    return isPlausibleAccountKey(text) ? { key: text, fp: null } : null;
  }

  async has(slot: KeySlot): Promise<boolean> {
    return (await this.load(slot).catch(() => null)) !== null;
  }

  async save(slot: KeySlot, key: string): Promise<void> {
    return this.update(() => this.write(slot, key));
  }

  private async write(slot: KeySlot, key: string): Promise<void> {
    if (!isPlausibleAccountKey(key)) throw new KeyStoreError("invalid");
    if (slot.mode === "public" && !isValidFingerprint(slot.fp)) throw new KeyStoreError("invalid");
    if (!this.crypto.isAvailable()) throw new KeyStoreError("unavailable");
    addSecret(key);
    await fsp.mkdir(this.dir, { recursive: true });
    const target = this.file(slot);
    const tmp = `${target}.tmp`;
    const fp = slot.mode === "public" ? (slot.fp as string) : "-";
    await fsp.writeFile(tmp, this.crypto.encrypt(`${FORMAT}\n${fp}\n${key}`));
    await fsp.rename(tmp, target);
    this.queueRecovery(slot,key,slot.mode==='public'?slot.fp:null);
  }

  // A redirected/cloud Documents folder must not hold the local key mutation queue.
  private queueRecovery(slot:KeySlot,key:string,fp:string|null):void {
    if (!this.recoveryDir) return;
    const id=serverId(slot.host,slot.port,slot.mode),text=`${FORMAT}\n${fp??'-'}\n${key}`;
    const identity=createHash('sha256').update(text).digest('hex');
    if(this.recoveryQueued.get(id)===identity)return;
    this.recoveryQueued.set(id,identity);
    this.recoveryPending=this.recoveryPending.then(async()=>{
      await fsp.mkdir(this.recoveryDir!,{recursive:true});
      const backup=path.join(this.recoveryDir!,`${id}.txt`);
      await fsp.writeFile(`${backup}.tmp`,text,{mode:0o600});
      await fsp.rename(`${backup}.tmp`,backup);
    }).catch(()=>{
      if(this.recoveryQueued.get(id)===identity)this.recoveryQueued.delete(id);
      log.warn('Automatic Documents account backup could not be written');
    });
  }

  // The key for this slot, or null. A public server's key is returned only for the exact
  // certificate it was saved with.
  async load(slot: KeySlot): Promise<string | null> {
    await this.pending;
    const stored = await this.read(slot);
    if (!stored) return null;
    if (slot.mode === "public" && (slot.fp === null || stored.fp !== slot.fp)) return null;
    addSecret(stored.key);
    // Queue under the primary mutation lock so a concurrent removal/rebind cannot
    // enqueue an old identity after its replacement or cleanup.
    if (this.recoveryDir) void this.update(async()=>{
      const current=await this.read(slot);
      if(current?.key===stored.key&&current.fp===stored.fp)this.queueRecovery(slot,stored.key,stored.fp);
    }).catch(()=>log.warn('Automatic Documents account backup unavailable'));
    return stored.key;
  }

  // Public servers: whether a key is stored for this host:port, and which certificate it belongs
  // to (fp null = a key from before keys were tied to certificates). null = no key stored.
  async certificateOf(slot: KeySlot): Promise<{ fp: string | null } | null> {
    await this.pending;
    const stored = await this.read(slot).catch(() => null);
    return stored ? { fp: stored.fp } : null;
  }

  // Moves this host:port's key to a new certificate. Only after the user confirmed the change.
  async rebind(slot: KeySlot, fp: string): Promise<boolean> {
    if (slot.mode !== "public" || !isValidFingerprint(fp)) throw new KeyStoreError("invalid");
    return this.update(async () => {
      const stored = await this.read(slot);
      if (!stored) return false;
      await this.write({ ...slot, fp }, stored.key);
      return true;
    });
  }

  async remove(slot: KeySlot): Promise<void> {
    return this.update(async () => {
      const stored = await this.read(slot).catch(() => null);
      if (stored) removeSecret(stored.key);
      await this.recoveryPending;
      await fsp.unlink(this.file(slot)).catch(() => undefined);
      if (this.recoveryDir) await fsp.unlink(path.join(this.recoveryDir, `${serverId(slot.host, slot.port, slot.mode)}.txt`)).catch(() => undefined);
      this.recoveryQueued.delete(serverId(slot.host,slot.port,slot.mode));
    });
  }
}

export function backupFileText(opts: {
  key: string;
  username: string | null;
  serverName: string;
  host: string;
  port: number;
  fingerprint?: string | null;
  date: Date;
}): string {
  return [
    "Dauntless Unbroken account key",
    "",
    `Server: ${opts.serverName} (${opts.host}:${opts.port})`,
    ...(opts.fingerprint ? [`Certificate: ${opts.fingerprint}`] : []),
    `Username: ${opts.username ?? "-"}`,
    `Saved: ${opts.date.toISOString().slice(0, 10)}`,
    `Key: ${opts.key}`,
    "",
    "Keep this file private: anyone who has this key can play as you on this server.",
    "On another PC or Steam Deck: open the launcher and choose Import account backup. Do not register again.",
    "",
  ].join("\r\n");
}

// The backup carries its original TLS pin; importing never guesses a public server certificate.
export function backupServer(text: string): (Omit<Invite, "code"> & {code:null}) | null {
  if (text.length > 8192) return null;
  const server = /^Server: ([^\r\n]{1,64}) \(([A-Za-z0-9.-]+):(\d{1,5})\)\r?$/m.exec(text);
  const certificates = [...text.matchAll(/^Certificate: ([^\r\n]*)\r?$/gm)];
  if (!server || [...text.matchAll(/^Server:/gm)].length !== 1 || certificates.length > 1) return null;
  const host = server[2].toLowerCase(), port = Number(server[3]);
  const fp = certificates[0]?.[1].trim().toLowerCase() ?? null;
  if (!isValidHost(host) || port < 1 || port > 65535 ||
      (fp !== null ? !isValidFingerprint(fp) : !isPrivateModeHost(host))) return null;
  return {host,port,fp,mode:fp === null ? "private" : "public",name:server[1],share:null,code:null};
}

// A Desktop copy is intentionally readable for recovery. Never replace another file or follow a link.
export function keyBackupId(opts: Pick<Parameters<typeof backupFileText>[0], 'host'|'port'|'fingerprint'|'key'>):string {
  return createHash('sha256').update(`${opts.host}:${opts.port}\n${opts.fingerprint ?? '-'}\n${opts.key}`).digest('hex');
}
export function desktopKeyPath(desktop:string,opts:Parameters<typeof backupFileText>[0]):string {
  const name = (opts.username ?? "Account").replace(/[^\p{L}\p{N}_-]/gu, "_").slice(0, 40) || "Account";
  return path.join(desktop, `Dauntless Unbroken key - ${name} - ${keyBackupId(opts).slice(0,16)}.txt`);
}
export async function matchesKeyBackup(file:string,key:string):Promise<boolean> {
  try {
    const st=await fsp.lstat(file);
    if(!st.isFile() || st.size>8192)return false;
    return extractAccountKey(await fsp.readFile(file,'utf8'))===key;
  } catch { return false; }
}
export async function saveDesktopKey(desktop: string, opts: Parameters<typeof backupFileText>[0]): Promise<string> {
  const file = desktopKeyPath(desktop,opts);
  const text = backupFileText(opts);
  let handle;
  try { handle = await fsp.open(file, "wx", 0o600); }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    const st = await fsp.lstat(file);
    if (!st.isFile() || st.size > 8192) throw new Error("Desktop key file collision");
    const old = await fsp.readFile(file, "utf8");
    if (!old.split(/\r?\n/).includes(`Key: ${opts.key}`)) throw new Error("Desktop key file collision");
    return file;
  }
  try { await handle.writeFile(text, "utf8"); await handle.sync(); }
  catch (e) { await handle.close(); await fsp.unlink(file).catch(() => undefined); throw e; }
  await handle.close();
  return file;
}
