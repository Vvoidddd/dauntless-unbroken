import { test } from "node:test";
import assert from "node:assert/strict";
import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { DISCORD_APPLICATION_ID, discordActivity, discordIpcPaths, DiscordPresence } from "../src/main/discord-presence";
import { defaultSettings, sanitizeSettings } from "../src/main/settings";
import { settingsPatch } from "../src/main/ipc-validate";
import type { Snapshot } from "../src/shared/types";

function snapshot(): Snapshot {
  return {
    settings: { discordPresence: true }, game: { running: false }, queue: null,
    busy: false, task: null, phase: "ready",
    account: { username: "PRIVATE-PLAYER", hasKey: true },
    server: { host: "PRIVATE-HOST", pin: "PRIVATE-PIN" },
  } as unknown as Snapshot;
}
const activity = () => discordActivity(snapshot(), { phase: "stopped" }, 123)!;
function frame(op: number, value: unknown): Buffer {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value));
  const header = Buffer.alloc(8);
  header.writeUInt32LE(op, 0); header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
async function until(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!check() && Date.now() < deadline) await delay(5);
  assert.ok(check(), "condition timed out");
}
async function fakeDiscord(t: { after(fn: () => unknown): void }, ready = true) {
  const endpoint = process.platform === "win32" ? `\\\\?\\pipe\\unbroken-test-${randomUUID()}` : path.join(os.tmpdir(), `ub-${randomUUID()}.sock`);
  const sockets: Socket[] = [];
  const messages: { op: number; body: any }[] = [];
  const server = net.createServer(socket => {
    sockets.push(socket);
    socket.on("error", () => {});
    let buffer = Buffer.alloc(0);
    socket.on("data", chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 8 && buffer.length >= buffer.readUInt32LE(4) + 8) {
        const size = buffer.readUInt32LE(4), op = buffer.readUInt32LE(0);
        const body = JSON.parse(buffer.subarray(8, size + 8).toString());
        buffer = buffer.subarray(size + 8);
        messages.push({ op, body });
        if (op === 0 && ready) {
          const response = frame(1, { cmd: "DISPATCH", evt: "READY" });
          // Header and payload may arrive across separate reads.
          socket.write(response.subarray(0, 5));
          setTimeout(() => { if (!socket.destroyed) socket.write(response.subarray(5)); }, 5);
        }
      }
    });
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(endpoint, resolve); });
  t.after(async () => {
    sockets.forEach(s => s.destroy());
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  const presence = new DiscordPresence("123456789012345678", { paths: [endpoint], minUpdateMs: 50, retryMs: 50, timeoutMs: 100 });
  t.after(() => presence.stop());
  return { endpoint, server, sockets, messages, presence };
}

test("presence uses only public activity and hides for opt-out or streamer mode", () => {
  assert.match(DISCORD_APPLICATION_ID, /^\d{17,20}$/);
  const s = snapshot();
  assert.equal(activity().details, "In the launcher");
  assert.ok(activity().assets.large_image.endsWith("/assets/behemoth-icon-192.png"));
  assert.ok(!JSON.stringify(activity()).includes("PRIVATE"));
  s.game.running = true;
  assert.equal(discordActivity(s, { phase: "running" }, 1)?.state, "Offline play");
  assert.equal(discordActivity(s, { phase: "stopped" }, 1)?.state, "Online play");
  s.game.running = false;
  s.queue = { state: "waiting", kind: "ramsgate", position: 2, total: 8 };
  assert.equal(discordActivity(s, { phase: "stopped" }, 1)?.state, "Queue position 2 of 8");
  s.queue.position = NaN;
  assert.equal(discordActivity(s, { phase: "stopped" }, 1)?.state, "Waiting for a free spot");
  s.queue = null;
  s.task = { kind: "download", paused: true } as Snapshot["task"];
  assert.equal(discordActivity(s, { phase: "stopped" }, 1)?.details, "Downloading the game");
  assert.equal(discordActivity(s, { phase: "stopped" }, 1)?.state, "Paused");
  s.settings.discordPresence = false;
  assert.equal(discordActivity(s, { phase: "stopped" }, 1), null);
  s.settings.discordPresence = true;
  s.settings.streamerMode = true;
  assert.equal(discordActivity(s, { phase: "stopped" }, 1), null);
});

test("presence preference survives settings sanitization and rejects invalid IPC values", () => {
  assert.equal(defaultSettings("en").discordPresence, true);
  assert.equal(sanitizeSettings({}, "en").discordPresence, true);
  assert.equal(sanitizeSettings({ discordPresence: false }, "en").discordPresence, false);
  assert.deepEqual(settingsPatch({ discordPresence: false }), { discordPresence: false });
  assert.equal(settingsPatch({ discordPresence: "false" }), null);
  assert.equal(discordIpcPaths("win32")[0], "\\\\?\\pipe\\discord-ipc-0");
  assert.equal(discordIpcPaths("linux", { XDG_RUNTIME_DIR: "/run/user/1" })[0], path.join("/run/user/1", "discord-ipc-0"));
});

test("IPC handshake, split frames, ping/pong, coalescing and immediate clear", async t => {
  const f = await fakeDiscord(t);
  f.presence.update(activity());
  await until(() => f.messages.some(m => m.body.cmd === "SET_ACTIVITY"));
  assert.deepEqual(f.messages[0], { op: 0, body: { v: 1, client_id: "123456789012345678" } });
  assert.equal(f.messages[1].body.args.pid, process.pid);
  assert.deepEqual(f.messages[1].body.args.activity, activity());
  f.sockets[0].write(Buffer.concat([frame(3, { ping: 1 }), frame(1, { evt: "ACTIVITY_JOIN" })]));
  await until(() => f.messages.some(m => m.op === 4));
  assert.deepEqual(f.messages.find(m => m.op === 4)?.body, { ping: 1 });
  f.presence.update({ ...activity(), state: "intermediate" });
  f.presence.update({ ...activity(), state: "latest" });
  await until(() => f.messages.some(m => m.body.args?.activity?.state === "latest"));
  assert.equal(f.messages.filter(m => m.body.cmd === "SET_ACTIVITY").length, 2);
  f.presence.update(null);
  await until(() => f.messages.some(m => m.body.args?.activity === null));
  await delay(80);
  assert.equal(f.sockets.length, 1, "disabled presence must not reconnect");
});

test("disconnect retries restore latest activity; stopped clients cannot restart", async t => {
  const f = await fakeDiscord(t);
  f.presence.update(activity());
  await until(() => f.messages.some(m => m.body.cmd === "SET_ACTIVITY"));
  f.sockets[0].destroy();
  await until(() => f.sockets.length === 2 && f.messages.filter(m => m.body.cmd === "SET_ACTIVITY").length === 2);
  f.presence.stop();
  f.presence.update(activity());
  await delay(120);
  assert.equal(f.sockets.length, 2);
});

test("IPC discovery skips missing endpoints and suppresses unchanged updates", async t => {
  const f = await fakeDiscord(t);
  const p = new DiscordPresence("123456789012345678", { paths: [f.endpoint + "-missing", f.endpoint], minUpdateMs: 30 });
  t.after(() => p.stop());
  p.update(activity());
  await until(() => f.messages.some(m => m.body.cmd === "SET_ACTIVITY"));
  p.update(activity());
  await delay(60);
  assert.equal(f.messages.filter(m => m.body.cmd === "SET_ACTIVITY").length, 1);
});

test("oversized or malformed Discord input and handshake timeout do not crash or hang", async t => {
  const f = await fakeDiscord(t, false);
  f.presence.update(activity());
  await until(() => f.messages.length > 0);
  const oversized = Buffer.alloc(8); oversized.writeUInt32LE(1); oversized.writeUInt32LE(65537, 4);
  f.sockets[0].write(oversized);
  await until(() => f.sockets.length >= 2);
  f.sockets[1].write(frame(1, Buffer.from("{bad json")));
  await until(() => f.sockets.length >= 3);
  await until(() => f.sockets.length >= 4); // No READY: handshake times out and retries.
  assert.equal(f.messages.filter(m => m.body.cmd === "SET_ACTIVITY").length, 0);
  f.presence.stop();
});

test("missing Discord client is optional and never blocks update or shutdown", async () => {
  const p = new DiscordPresence("123456789012345678", { paths: [process.platform === "win32" ? "\\\\?\\pipe\\unbroken-missing" : "/tmp/unbroken-missing.sock"], retryMs: 10 });
  p.update(activity());
  await delay(40);
  p.stop();
  const disabled = new DiscordPresence("");
  disabled.update(activity());
  disabled.stop();
});
