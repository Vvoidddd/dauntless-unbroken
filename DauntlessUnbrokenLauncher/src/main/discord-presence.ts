import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import type { OfflineStatus, Snapshot } from "../shared/types";

// Public application ID, not a Discord token.
export const DISCORD_APPLICATION_ID = "1561808870995664918";

export interface DiscordActivity {
  type: 0;
  details: string;
  state: string;
  timestamps: { start: number };
  assets: { large_image: string; large_text: string };
  buttons: { label: string; url: string }[];
}

// Only public activity is sent to the local Discord client. Never include server/account data.
export function discordActivity(s: Snapshot, offline: OfflineStatus, started: number): DiscordActivity | null {
  if (s.settings.discordPresence === false || s.settings.streamerMode) return null;
  let details = "In the launcher";
  let state = "Ready for adventure";
  if (s.game.running) {
    details = "Playing Dauntless Unbroken";
    state = offline.phase === "running" || offline.phase === "launching-game" ? "Offline play" : "Online play";
  } else if (s.queue?.state === "waiting") {
    details = s.queue.kind === "hunt" ? "Waiting for a hunt" : "Waiting to enter Ramsgate";
    const { position, total } = s.queue;
    state = Number.isSafeInteger(position) && position! > 0 && Number.isSafeInteger(total) && total! >= position!
      ? `Queue position ${position} of ${total}` : "Waiting for a free spot";
  } else if (s.task) {
    details = s.task.kind === "download" ? "Downloading the game" : "Preparing game files";
    state = s.task.paused ? "Paused" : "Getting ready to play";
  } else if (["preparing", "starting-metagame", "starting-deploy", "launching-game"].includes(offline.phase) || s.busy) {
    state = "Getting ready to play";
  }
  return {
    type: 0, details, state, timestamps: { start: started },
    assets: {
      large_image: "https://vvoidddd.github.io/dauntless-unbroken/assets/behemoth-icon-192.png",
      large_text: "Dauntless Unbroken",
    },
    buttons: [{ label: "Get the launcher", url: "https://github.com/Vvoidddd/dauntless-unbroken/releases/latest" }],
  };
}

export function discordIpcPaths(platform = process.platform, env = process.env): string[] {
  const root = env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || os.tmpdir();
  return Array.from({ length: 10 }, (_, i) => platform === "win32"
    ? `\\\\?\\pipe\\discord-ipc-${i}` : path.join(root, `discord-ipc-${i}`));
}

const MAX_FRAME = 64 * 1024;
function frame(op: number, payload: unknown): Buffer {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
  const header = Buffer.alloc(8);
  header.writeUInt32LE(op, 0);
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

/** Best-effort local IPC; Discord being closed must never block launching the game. */
export class DiscordPresence {
  private socket: Socket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private desired: DiscordActivity | null = null;
  private ready = false;
  private stopped = false;
  private sent = "";
  private lastSend = 0;
  private nonce = 0;
  private readonly paths: string[];
  private readonly minUpdateMs: number;
  private readonly retryMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly clientId: string, options: {
    paths?: string[]; minUpdateMs?: number; retryMs?: number; timeoutMs?: number;
  } = {}) {
    this.paths = options.paths ?? discordIpcPaths();
    this.minUpdateMs = options.minUpdateMs ?? 15_000;
    this.retryMs = options.retryMs ?? 30_000;
    this.timeoutMs = options.timeoutMs ?? 2_000;
  }

  update(activity: DiscordActivity | null): void {
    if (this.stopped) return;
    this.desired = activity;
    if (!activity) { this.disconnect(); return; }
    if (!/^\d{17,20}$/.test(this.clientId)) return;
    if (this.ready) this.flush();
    else if (!this.socket && !this.timer) this.connect(0);
  }

  stop(): void {
    this.stopped = true;
    this.desired = null;
    this.disconnect();
  }

  private disconnect(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket && !socket.destroyed) {
      if (this.ready) {
        socket.end(frame(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity: null }, nonce: String(++this.nonce) }));
        setTimeout(() => socket.destroy(), 1_000).unref();
      } else socket.destroy();
    }
    this.ready = false;
    this.sent = "";
    this.lastSend = 0;
  }

  private schedule(fn: () => void, delay: number): void {
    if (this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; fn(); }, delay);
    this.timer.unref();
  }

  private connect(index: number): void {
    if (this.stopped || !this.desired) return;
    if (index >= this.paths.length) {
      this.schedule(() => this.connect(0), this.retryMs);
      return;
    }
    const socket = net.createConnection(this.paths[index]);
    this.socket = socket;
    socket.unref();
    let buffer = Buffer.alloc(0);
    const fail = () => {
      if (this.socket !== socket) return;
      const wasReady = this.ready;
      this.socket = null;
      this.ready = false;
      this.sent = "";
      this.lastSend = 0;
      socket.destroy();
      if (this.timer) clearTimeout(this.timer);
      this.timer = null;
      if (!this.stopped && this.desired) {
        if (wasReady) this.schedule(() => this.connect(0), this.retryMs);
        else this.connect(index + 1);
      }
    };
    socket.setTimeout(this.timeoutMs, fail);
    socket.on("error", fail);
    socket.on("close", fail);
    socket.on("connect", () => socket.write(frame(0, { v: 1, client_id: this.clientId })));
    socket.on("data", chunk => {
      if (this.socket !== socket) return;
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 8) {
        const op = buffer.readUInt32LE(0), size = buffer.readUInt32LE(4);
        if (size > MAX_FRAME) { fail(); return; }
        if (buffer.length < size + 8) return;
        const body = buffer.subarray(8, size + 8);
        buffer = buffer.subarray(size + 8);
        if (op === 3) { socket.write(frame(4, body)); continue; }
        if (op === 4) continue;
        if (op !== 1) { fail(); return; }
        try {
          const message = JSON.parse(body.toString("utf8"));
          if (message?.evt === "ERROR") { fail(); return; }
          if (message?.evt === "READY") {
            this.ready = true;
            socket.setTimeout(0);
            this.flush();
          }
        } catch { fail(); return; }
      }
    });
  }

  private flush(): void {
    if (!this.ready || !this.socket || !this.desired || this.stopped) return;
    const json = JSON.stringify(this.desired);
    if (json === this.sent) return;
    const wait = this.lastSend + this.minUpdateMs - Date.now();
    if (wait > 0) { this.schedule(() => this.flush(), wait); return; }
    this.socket.write(frame(1, { cmd: "SET_ACTIVITY", args: { pid: process.pid, activity: this.desired }, nonce: String(++this.nonce) }));
    this.sent = json;
    this.lastSend = Date.now();
  }
}
