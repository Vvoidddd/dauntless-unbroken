import { execFile } from "node:child_process";
import { accessSync, constants as fsConstants, existsSync, statSync,readFileSync,mkdirSync,writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type LinuxDependencyKind = "runtime" | "secure-storage";
const SECURE_STORES: Record<string,string> = {gnome_libsecret:'gnome-libsecret',kwallet:'kwallet',kwallet5:'kwallet5',kwallet6:'kwallet6'};
export function linuxStorageSwitch(backend: string): string | null { return Object.hasOwn(SECURE_STORES,backend) ? SECURE_STORES[backend] : null; }
export function readLinuxStoragePreference(file: string): string | null {
  try { const saved=JSON.parse(readFileSync(file,'utf8'));return saved.version===1 && typeof saved.backend==='string' ? linuxStorageSwitch(saved.backend) : null; } catch { return null; }
}
export function rememberLinuxStoragePreference(file: string, backend: string): void {
  if(!linuxStorageSwitch(backend))return;
  mkdirSync(path.dirname(file),{recursive:true});
  writeFileSync(file,JSON.stringify({version:1,backend}),{mode:0o600});
}

// Gaming Mode identifies as Gamescope rather than KDE. Use the installed wallet
// on SteamOS in both modes so the same encrypted account keys remain readable.
export function steamOsPasswordStore(osRelease: string, wallet6: boolean, wallet5: boolean): "kwallet6" | "kwallet5" | null {
  if (!/^ID=["']?steamos["']?\s*$/mi.test(osRelease)) return null;
  return wallet6 ? "kwallet6" : wallet5 ? "kwallet5" : null;
}

export interface LinuxDependencyInstallPlan {
  name: string;
  command: string;
  args: string[];
}

function executable(file: string): boolean {
  try {
    accessSync(file, fsConstants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function findExecutable(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  if (path.isAbsolute(name)) return executable(name) ? name : null;
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, name);
    if (executable(candidate)) return candidate;
  }
  for (const dir of ["/usr/bin", "/usr/sbin", "/bin", "/sbin", "/usr/local/bin"]) {
    const candidate = path.join(dir, name);
    if (executable(candidate)) return candidate;
  }
  return null;
}

function elevated(command: string, args: string[], env: NodeJS.ProcessEnv): LinuxDependencyInstallPlan | null {
  if (typeof process.getuid === "function" && process.getuid() === 0) {
    return { name: path.basename(command), command, args };
  }
  const pkexec = findExecutable("pkexec", env);
  return pkexec ? { name: path.basename(command), command: pkexec, args: [command, ...args] } : null;
}

export function linuxDependencyInstallPlan(
  kind: LinuxDependencyKind,
  env: NodeJS.ProcessEnv = process.env,
  osRelease: string = (()=>{try{return readFileSync('/etc/os-release','utf8');}catch{return '';}})(),
): LinuxDependencyInstallPlan | null {
  // SteamOS uses an immutable system image; use Steam-installed Proton on the Deck.
  if(/^ID=["']?steamos["']?\s*$/mi.test(osRelease))return null;
  const apt = findExecutable("apt-get", env);
  if (apt) {
    return elevated(
      apt,
      kind === "runtime"
        ? ["install", "-y", "wine64"]
        : ["install", "-y", "gnome-keyring", "libsecret-1-0"],
      env,
    );
  }
  const dnf = findExecutable("dnf", env);
  if (dnf) {
    return elevated(
      dnf,
      kind === "runtime" ? ["install", "-y", "wine"] : ["install", "-y", "gnome-keyring", "libsecret"],
      env,
    );
  }

  const zypper = findExecutable("zypper", env);
  if (zypper) {
    return elevated(
      zypper,
      kind === "runtime"
        ? ["--non-interactive", "install", "wine"]
        : ["--non-interactive", "install", "gnome-keyring", "libsecret"],
      env,
    );
  }

  const pacman = findExecutable("pacman", env);
  if (pacman) {
    return elevated(
      pacman,
      kind === "runtime"
        ? ["-S", "--needed", "--noconfirm", "wine"]
        : ["-S", "--needed", "--noconfirm", "gnome-keyring", "libsecret"],
      env,
    );
  }
  const xbps = findExecutable("xbps-install", env);
  if (xbps) {
    return elevated(
      xbps,
      kind === "runtime" ? ["-Sy", "wine"] : ["-Sy", "gnome-keyring", "libsecret"],
      env,
    );
  }

  return null;
}

export function runLinuxDependencyInstall(
  plan: LinuxDependencyInstallPlan,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = env.HOME ?? os.homedir(),
  timeoutMs = 15 * 60_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(plan.command, plan.args, { env, cwd, timeout: timeoutMs, windowsHide: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function repairLinuxDesktopEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  uid: number | null = typeof process.getuid === "function" ? process.getuid() : null,
): { forceGnomeLibsecret: boolean; passwordStore?: "kwallet6" | "kwallet5" } {
  if (process.platform !== "linux") return { forceGnomeLibsecret: false };
  const runtimeDir = env.XDG_RUNTIME_DIR || (uid === null ? "" : `/run/user/${uid}`);
  if (!env.XDG_RUNTIME_DIR && runtimeDir && existsSync(runtimeDir)) env.XDG_RUNTIME_DIR = runtimeDir;
  if (!env.DBUS_SESSION_BUS_ADDRESS && runtimeDir && existsSync(path.join(runtimeDir, "bus"))) {
    env.DBUS_SESSION_BUS_ADDRESS = `unix:path=${path.join(runtimeDir, "bus")}`;
  }

  const desktop = `${env.XDG_CURRENT_DESKTOP ?? ""} ${env.DESKTOP_SESSION ?? ""}`.toLowerCase();
  const gnomeFamily = /(gnome|ubuntu|cinnamon|mate|xfce)/.test(desktop);
  const keyringSocket = runtimeDir ? path.join(runtimeDir, "keyring", "control") : "";
  let osRelease = "";
  try { osRelease = readFileSync('/etc/os-release','utf8'); } catch { /* Other Linux desktops keep automatic selection. */ }
  const passwordStore = steamOsPasswordStore(osRelease,
    ['/usr/bin/kwalletd6','/usr/lib/kwalletd6','/usr/libexec/kwalletd6'].some(existsSync),
    ['/usr/bin/kwalletd5','/usr/lib/kwalletd5','/usr/libexec/kwalletd5'].some(existsSync));
  return { forceGnomeLibsecret: gnomeFamily || (keyringSocket !== "" && existsSync(keyringSocket)), ...(passwordStore ? {passwordStore} : {}) };
}
