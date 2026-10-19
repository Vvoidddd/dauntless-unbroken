// Links the launcher opens in the browser. The page only names a link; the main process opens exactly
// that link's fixed URL. Raw URLs, unknown names, look-alike hosts and other repositories never get
// through, neither at the IPC check nor at the URL allow-list.
// Port: 62445 a private-mode (plain HTTP, loopback) metagame that announces its own source link.

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Controller, type Platform } from "../src/main/controller";
import { externalTarget } from "../src/main/ipc-validate";
import { FIXED_LINKS, fixedLinkUrl, isAllowedExternalUrl, isAllowedStaticUrl, type FixedTarget } from "../src/main/links";
import { setSink } from "../src/main/log";
import { formatInvite } from "../src/shared/invite";
import { parseServerStatus } from "../src/shared/status";
import type { ExternalTarget } from "../src/shared/types";
import { FakeMetagame } from "./fakes";

const HOST_PORT = 62445;
const HOST_SOURCE = "https://git.example.org/friday/server";
const SHARE = "https://login.tailscale.com/admin/invite/links-test";

// Every fixed link and the one URL it opens, written out here on purpose (not taken from constants.ts).
const EXPECTED: Record<FixedTarget, string> = {
  tailscale_download: "https://tailscale.com/download",
  vc_redist: "https://aka.ms/vs/17/release/vc_redist.x64.exe",
  directx_runtime: 'https://www.microsoft.com/en-us/download/details.aspx?id=35',
  project_source: "https://github.com/Vvoidddd/dauntless-unbroken",
  project_license: "https://github.com/Vvoidddd/dauntless-unbroken/blob/main/LICENSE.txt",
  project_contributors: "https://github.com/Vvoidddd/dauntless-unbroken/graphs/contributors",
  upstream_source: "https://github.com/SyST3MDeV/Undaunted",
  upstream_contributors: "https://github.com/SyST3MDeV/Undaunted/graphs/contributors",






  discord: "https://github.com/Vvoidddd/dauntless-unbroken/discussions",
  patreon: "https://github.com/Vvoidddd/dauntless-unbroken",
};

// A Record, so the compiler fails this file when a link name is added without a test here.
const ALL_TARGETS: Record<ExternalTarget, true> = {
  tailscale_download: true,
  tailscale_share: true,
  vc_redist: true,
  directx_runtime: true,
  server_source: true,
  project_source: true,
  project_license: true,
  project_contributors: true,
  upstream_source: true,
  upstream_contributors: true,






  discord: true,
  patreon: true,
};

// Raw URLs and tricks: none of these may ever be opened.
const BAD_URLS = [
  "https://github.com.evil.example/Vvoidddd/dauntless-unbroken",
  "https://github.com@evil.example/Vvoidddd/dauntless-unbroken",
  "https://evil.example@github.com/Vvoidddd/dauntless-unbroken",
  "https://github.com:x@github.com/Vvoidddd/dauntless-unbroken",
  "https://evil.example/https://github.com/Vvoidddd/dauntless-unbroken",
  "http://github.com/Vvoidddd/dauntless-unbroken",
  "http://github.com/SyST3MDeV/Undaunted/graphs/contributors",
  "javascript:alert(1)",
  "JavaScript:alert(1)//https://github.com/Vvoidddd/dauntless-unbroken",
  "data:text/html,<script>alert(1)</script>",
  "file:///C:/Windows/System32/calc.exe",
  "dauntless-unbroken://join?v=1",
  "https://github.com/mixutin/other-repo",
  "https://github.com/evil/dauntless-unbroken",
  "https://github.com/Vvoidddd/dauntless-unbroken-evil",
  "https://github.com/SyST3MDeV/dauntless-unbroken-evil",
  "https://github.com/SyST3MDeV/Other",
  "https://github.com/Vvoidddd/dauntless-unbroken/issues",
  "https://github.com/Vvoidddd/dauntless-unbroken/releases/download/launcher-updates/evil.exe",
  "https://github.com/Vvoidddd/dauntless-unbroken/../../evil/repo",
  "https://github.com/Vvoidddd/dauntless-unbroken/%2e%2e/%2e%2e/evil/repo",
  "https://github.com/Vvoidddd/dauntless-unbroken/graphs/contributors/%2e%2e/%2e%2e/%2e%2e/evil",
  "https://github.com/mixutin%2Fdauntless-unbroken",
  "https://github.com/%6Dixutin/dauntless-unbroken",
  "https://GITHUB.COM/Vvoidddd/dauntless-unbroken",
  "HTTPS://github.com/Vvoidddd/dauntless-unbroken",
  "https://github.com/MIXUTIN/DAUNTLESS-UNBROKEN",
  "https://github.com/syst3mdev/unbroken",
  "https://github.com:443/Vvoidddd/dauntless-unbroken",
  "https://github.com:8443/Vvoidddd/dauntless-unbroken",
  "https://github.com./Vvoidddd/dauntless-unbroken",
  "https://github.com%2eevil.example/Vvoidddd/dauntless-unbroken",
  "https://xn--gthub-n4a.com/Vvoidddd/dauntless-unbroken",
  "https://gіthub.com/Vvoidddd/dauntless-unbroken",
  "https://github.com/Vvoidddd/dauntless-unbroken/",
  "https://github.com/Vvoidddd/dauntless-unbroken?x=1",
  "https://github.com/Vvoidddd/dauntless-unbroken#readme",
  " https://github.com/Vvoidddd/dauntless-unbroken",
  "https://github.com/Vvoidddd/dauntless-unbroken ",
  "https://github.com/Vvoidddd/dauntless-unbroken\n",
  "https://tailscale.com.evil.example/download/windows",
  "https://login.tailscale.com@evil.example/",
  "https://aka.ms/evil",
  "https://www.eugamehost.com.evil.example/",
  "https://www.eugamehost.com/clients/cart.php?a=add&pid=999",
  "https://eugamehost.com/",
  "https://discord.gg.evil.example/ZJRprHzsgu",
  "https://discord.gg/dauntlessrevived/extra",
  "https://discord.com/invite/ZJRprHzsgu",
  "https://evil.example/",
  "",
];

const temps: string[] = [];
const logLines: string[] = [];
setSink((l) => logLines.push(l));

after(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

function controller(): { c: Controller; opened: string[] } {
  const dir = mkdtempSync(path.join(tmpdir(), "dr-links-"));
  temps.push(dir);
  const opened: string[] = [];
  const p: Platform = {
    userDataDir: dir,
    resourcesDir: dir,
    defaultInstallDir: path.join(dir, "game"),
    appVersion: "0.0.0-test",
    packaged: false,
    defaultLanguage: "en",
    encryptor: { isAvailable: () => false, encrypt: () => Buffer.alloc(0), decrypt: () => "" },
    manifest: null,
    chooseFolder: async () => null,
    chooseSaveFile: async () => null,
    chooseOpenFile: async () => null,
    openExternal: async (url) => {
      opened.push(url);
    },
    openPath: async () => undefined,
    emitSnapshot: () => undefined,
    emitOfflineStatus: () => {},
    emitProgress: () => undefined,
    findTailscale: () => null,
    findRunningClients: async () => [],
  };
  return { c: new Controller(p), opened };
}

// A controller that has joined a private server announcing sourceUrl, through an invite carrying
// the given Tailscale share link, with the server's status loaded.
async function joined(sourceUrl: string, share: string | null): Promise<{ c: Controller; opened: string[]; stop: () => Promise<void> }> {
  const meta = new FakeMetagame({ name: "Link Hunts", validCodes: new Set(["LINK-CODE"]), contentPort: null, sourceUrl });
  await meta.start(HOST_PORT);
  const { c, opened } = controller();
  const stop = async () => {
    await c.shutdown();
    await meta.stop();
  };
  try {
    await c.init();
    const text = formatInvite({ mode: "private", host: "127.0.0.1", port: HOST_PORT, fp: null, code: "LINK-CODE", name: "Link Hunts", share });
    assert.deepEqual(await c.submitInvite(text), { ok: true });
    assert.equal(c.snapshot().status?.sourceUrl, sourceUrl, "the host's status is loaded");
    assert.equal(c.snapshot().server?.hasShare, share !== null);
  } catch (e) {
    await stop();
    throw e;
  }
  opened.length = 0;
  return { c, opened, stop };
}

test("every fixed link name maps to exactly its URL", () => {
  assert.deepEqual({ ...FIXED_LINKS }, EXPECTED);
  for (const [name, url] of Object.entries(EXPECTED)) {
    assert.equal(fixedLinkUrl(name), url, name);
    assert.ok(isAllowedStaticUrl(url), `${name} must pass the allow-list`);
  }
  assert.ok(Object.isFrozen(FIXED_LINKS));
});

test("each link name opens exactly its URL, once", async () => {
  for (const [name, url] of Object.entries(EXPECTED)) {
    const { c, opened } = controller();
    const r = await c.openExternal(name as ExternalTarget);
    assert.deepEqual(r, { ok: true }, name);
    assert.deepEqual(opened, [url], name);
  }
  // No status from a host yet: the server's source link falls back to the project's repository.
  const { c, opened } = controller();
  assert.deepEqual(await c.openExternal("server_source"), { ok: true });
  assert.deepEqual(opened, [EXPECTED.project_source]);
});

test("the Tailscale share link opens nothing without a private invite", async () => {
  const { c, opened } = controller();
  const r = await c.openExternal("tailscale_share");
  assert.equal(r.ok, false);
  assert.deepEqual(opened, []);
});

test("with a host's status loaded: its source link opens as itself, and never changes a fixed link", async () => {
  const hx = await joined(HOST_SOURCE, SHARE);
  try {
    assert.deepEqual(await hx.c.openExternal("server_source"), { ok: true });
    assert.deepEqual(hx.opened, [HOST_SOURCE], "the host's own source link, exactly, once");

    for (const [name, url] of Object.entries(EXPECTED)) {
      hx.opened.length = 0;
      assert.deepEqual(await hx.c.openExternal(name as ExternalTarget), { ok: true }, name);
      assert.deepEqual(hx.opened, [url], `${name} still opens only its own URL`);
    }

    hx.opened.length = 0;
    assert.deepEqual(await hx.c.openExternal("tailscale_share"), { ok: true });
    assert.deepEqual(hx.opened, [SHARE], "the invite's own share link, exactly, once");

    // The host's link is not a link name either: sent as one, it opens nothing.
    for (const name of [HOST_SOURCE, SHARE, "__proto__", "repo"]) {
      hx.opened.length = 0;
      assert.equal((await hx.c.openExternal(name as ExternalTarget)).ok, false, name);
      assert.deepEqual(hx.opened, [], name);
    }
  } finally {
    await hx.stop();
  }
});

test("a host's source link on its own port opens too, and no share link means nothing to open", async () => {
  const withPort = "https://git.example.org:3000/friday/server";
  const hx = await joined(withPort, null);
  try {
    assert.deepEqual(await hx.c.openExternal("server_source"), { ok: true });
    assert.deepEqual(hx.opened, [withPort]);
    hx.opened.length = 0;
    assert.equal((await hx.c.openExternal("tailscale_share")).ok, false);
    assert.deepEqual(hx.opened, []);
    // The port is allowed for the host's own link only, never for a fixed page.
    assert.equal(isAllowedExternalUrl("https://github.com:3000/Vvoidddd/dauntless-unbroken", withPort), false);
  } finally {
    await hx.stop();
  }
});

test("every source link the status check keeps is one the link check opens", () => {
  const kept = [
    HOST_SOURCE,
    "https://git.example.org:3000/friday/server",
    "https://git.example.org:443/friday/server",
    "https://GIT.Example.org/friday/server",
    "https://git.example.org/friday server",
    "https://bücher.example/src",
    "https://git.example.org/" + " x".repeat(240),
  ];
  const dropped = [
    "http://git.example.org/friday/server",
    "https://user:pw@git.example.org/friday/server",
    "javascript:alert(1)",
    "https://git.example.org/" + " ".repeat(400) + "x", // too long once encoded
    "not a url",
  ];
  for (const raw of [...kept, ...dropped]) {
    const url = parseServerStatus({ name: "x", sourceUrl: raw })?.sourceUrl ?? null;
    assert.equal(url !== null, kept.includes(raw), JSON.stringify(raw));
    if (url !== null) assert.ok(isAllowedExternalUrl(url, url), `the Source button for ${JSON.stringify(url)} would do nothing`);
  }
});

test("unknown names and raw URLs sent as a link name open nothing", async () => {
  const names = [...BAD_URLS, ...Object.values(EXPECTED), "__proto__", "constructor", "toString", "hasOwnProperty", "valueOf", "PROJECT_SOURCE", "project-source", "project_source ", "repo", "github"];
  for (const name of names) {
    const { c, opened } = controller();
    const r = await c.openExternal(name as ExternalTarget);
    assert.equal(r.ok, false, JSON.stringify(name));
    assert.deepEqual(opened, [], JSON.stringify(name));
    assert.equal(fixedLinkUrl(name), null, JSON.stringify(name));
  }
});

test("look-alike hosts, other repositories and other schemes are refused by the allow-list", () => {
  for (const url of BAD_URLS) {
    assert.equal(isAllowedStaticUrl(url), false, JSON.stringify(url));
    assert.equal(isAllowedExternalUrl(url, null), false, JSON.stringify(url));
    // The host's own source link lets through that exact link only, never another one.
    assert.equal(isAllowedExternalUrl(url, "https://git.example.org/friday/server"), false, JSON.stringify(url));
  }
  // A host's source link is allowed only as itself, and only over plain https.
  assert.equal(isAllowedExternalUrl("https://git.example.org/friday/server", "https://git.example.org/friday/server"), true);
  assert.equal(isAllowedExternalUrl("http://git.example.org/friday/server", "http://git.example.org/friday/server"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)", "javascript:alert(1)"), false);
});

test("the IPC check lets through exactly the link names, nothing else", () => {
  for (const name of Object.keys(ALL_TARGETS)) assert.equal(externalTarget(name), name);
  const bad: unknown[] = [
    ...BAD_URLS,
    ...Object.values(EXPECTED),
    "PROJECT_SOURCE",
    "Project_Source",
    " project_source",
    "project_source ",
    "project_source\0",
    "project_source\n",
    "project-source",
    "project_source?",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "repo",
    "contributors",
    null,
    undefined,
    0,
    1,
    true,
    NaN,
    {},
    [],
    ["project_source"],
    { target: "project_source" },
    { toString: () => "project_source" },
    new String("project_source"),
    Symbol("project_source"),
    () => "project_source",
  ];
  for (const v of bad) assert.equal(externalTarget(v), null, String(typeof v === "symbol" ? v.toString() : JSON.stringify(v)));
});
