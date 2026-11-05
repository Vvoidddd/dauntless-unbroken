import { app } from "electron";
import { constants, existsSync, promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { URL } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import {launcherRelaunchOptions} from './launch';

export type LinuxUpdate = { url: string; kind: "deb" | "rpm" | "appimage"; version: string; sha256: string; size: number };

const RELEASE_DOWNLOAD_PREFIX = "https://github.com/Vvoidddd/dauntless-unbroken/releases/download/";
const UPDATE_DOWNLOAD_TIMEOUT_MS = 15 * 60_000;

function trustedGitHubApiUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "api.github.com";
  } catch {
    return false;
  }
}

function trustedReleaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (
      (url.hostname === "github.com" && url.href.startsWith(RELEASE_DOWNLOAD_PREFIX)) ||
      url.hostname === "objects.githubusercontent.com" ||
      url.hostname === "release-assets.githubusercontent.com" ||
      url.hostname === "github-releases.githubusercontent.com"
    );
  } catch {
    return false;
  }
}

function checksumFor(checksums: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = checksums.split(/\r?\n/).filter((line) => new RegExp(`^[0-9a-fA-F]{64}\\s+[* ]?${escaped}$`).test(line));
  if (matches.length !== 1) throw new Error(`release checksum missing or ambiguous for ${name}`);
  return matches[0].trim().split(/\s+/)[0].toLowerCase();
}

function integrityOf(update: LinuxUpdate): void {
  if (!trustedReleaseUrl(update.url) || !/^[0-9a-f]{64}$/i.test(update.sha256) || !Number.isSafeInteger(update.size) || update.size < 0) {
    throw new Error("Linux update integrity metadata is missing or invalid");
  }
}

async function downloadVerified(update: LinuxUpdate, destination: string): Promise<void> {
  integrityOf(update);
  const response = await fetch(update.url, { redirect: "follow", signal: AbortSignal.timeout(UPDATE_DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`update download failed (${response.status})`);
  if (!trustedReleaseUrl(response.url || update.url)) throw new Error("update download redirected outside trusted GitHub release URLs");
  if (!response.body) throw new Error("update download returned no body");
  const contentLength = response.headers?.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > update.size) {
    throw new Error(`update size mismatch (expected ${update.size}, received more than expected)`);
  }
  const file = await fs.open(destination, "wx", 0o600);
  const hash = createHash("sha256");
  let size = 0;
  try {
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      const bytes = Buffer.from(chunk);
      if (size + bytes.length > update.size) {
        throw new Error(`update size mismatch (expected ${update.size}, received more than expected)`);
      }
      size += bytes.length;
      hash.update(bytes);
      await file.write(bytes);
    }
  } finally {
    await file.close();
  }
  const actual = hash.digest("hex");
  if (size !== update.size) throw new Error(`update size mismatch (expected ${update.size}, received ${size})`);
  if (actual !== update.sha256.toLowerCase()) throw new Error(`update SHA-256 mismatch (expected ${update.sha256}, received ${actual})`);
}

function newer(a: string, b: string): boolean {
  const aa = a.split(".").map(Number), bb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    if ((aa[i] || 0) !== (bb[i] || 0)) return (aa[i] || 0) > (bb[i] || 0);
  }
  return false;
}

export async function findLinuxUpdate(): Promise<LinuxUpdate | null> {
  const response = await fetch("https://api.github.com/repos/Vvoidddd/dauntless-unbroken/releases/latest", {
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "application/vnd.github+json", "User-Agent": `DauntlessUnbrokenLauncher/${app.getVersion()}` },
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  if (!trustedGitHubApiUrl(response.url || "https://api.github.com/")) throw new Error("GitHub release metadata used an insecure URL");
  const release = await response.json() as { tag_name?: string; assets?: Array<{ name?: string; browser_download_url?: string; size?: number }> };
  const version = String(release.tag_name || "").replace(/^launcher-v/, "");
  if (!version || !newer(version, app.getVersion())) return null;
  const wanted = process.env.APPIMAGE ? "AppImage" : existsSync("/usr/bin/dpkg") ? ".deb" : existsSync("/usr/bin/rpm") ? ".rpm" : "";
  if (!wanted) return null;
  const asset = release.assets?.find((a) => a.name?.includes(`-${version}-linux-`) && a.name.endsWith(wanted));
  const sums = release.assets?.find((a) => a.name === "SHA256SUMS-LINUX.txt");
  const size = asset?.size;
  if (!asset?.name || !asset.browser_download_url || !trustedReleaseUrl(asset.browser_download_url) || typeof size !== "number" || !Number.isSafeInteger(size) || size < 0 || !sums?.browser_download_url || !trustedReleaseUrl(sums.browser_download_url)) return null;
  const sumResponse = await fetch(sums.browser_download_url, { redirect: "follow", signal: AbortSignal.timeout(10_000) });
  if (!sumResponse.ok) throw new Error(`Linux release checksums unavailable (${sumResponse.status})`);
  if (!trustedReleaseUrl(sumResponse.url || sums.browser_download_url)) throw new Error("Linux release checksums used an untrusted URL");
  const sha256 = checksumFor(await sumResponse.text(), asset.name);
  return { url: asset.browser_download_url, kind: wanted === ".deb" ? "deb" : wanted === ".rpm" ? "rpm" : "appimage", version, sha256, size };
}

export async function installLinuxUpdate(update: LinuxUpdate): Promise<"relaunch" | "quit"> {
  const dir = await fs.mkdtemp(path.join(app.getPath("temp"), "dauntless-unbroken-update-"));
  let next: string | undefined;
  try {
    const ext = update.kind === "deb" ? ".deb" : update.kind === "rpm" ? ".rpm" : ".AppImage";
    const file = path.join(dir, `DauntlessUnbrokenLauncher-${update.version}${ext}`);
    await downloadVerified(update, file);
    if (update.kind === "appimage") {
      const target = process.env.APPIMAGE;
      if (!target) throw new Error("APPIMAGE path is unavailable");
      next = `${target}.new-${randomUUID()}`;
      await fs.copyFile(file, next, constants.COPYFILE_EXCL);
      await fs.chmod(next, 0o755);
      await fs.rename(next, target);
      next = undefined;
      app.relaunch(launcherRelaunchOptions('linux',target));
      return "relaunch";
    }
    const args = update.kind === "deb" ? ["apt", "install", "-y", file] : ["rpm", "-U", file];
    const child = spawn("pkexec", args, { stdio: "ignore" });
    await new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Package installer failed (${signal ?? code ?? "unknown"})`));
      });
    });
    return "quit";
  } finally {
    if (next) await fs.rm(next, { force: true });
    await fs.rm(dir, { recursive: true, force: true });
  }
}
