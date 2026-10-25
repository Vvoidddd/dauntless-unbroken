import { execFile } from "node:child_process";
import { accessSync, constants as fsConstants, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LaunchRuntime } from "./launch";
import { linuxDependencyInstallPlan, runLinuxDependencyInstall } from "./linux-dependencies";
import { describeError, log } from "./log";

export type LinuxRuntimeKind = "proton" | "wine";

export interface DetectedLinuxRuntime {
  kind: LinuxRuntimeKind;
  name: string;
  command: string;
  prefixDir: string;
  compatDataDir: string | null;
  env: NodeJS.ProcessEnv;
}

export interface PreparedLinuxGameLaunch {
  runtime: LaunchRuntime;
  configDir: string;
  runtimeName: string;
}

export class LinuxRuntimeMissingError extends Error {
  constructor() {
    super("No compatible Proton or Wine runtime was found");
    this.name = "LinuxRuntimeMissingError";
  }
}

function executable(file: string): boolean {
  try {
    accessSync(file, fsConstants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

function fromPath(name: string, env: NodeJS.ProcessEnv): string | null {
  if (path.isAbsolute(name) || name.includes("/") || name.includes("\\")) return executable(name) ? path.resolve(name) : null;
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    if (!dir) continue;
    const file = path.join(dir, name);
    if (executable(file)) return file;
  }
  return null;
}

function customRuntime(value: string | undefined, env: NodeJS.ProcessEnv): string | null {
  if (!value) return null;
  const expanded = value.startsWith("~/") ? path.join(env.HOME ?? os.homedir(), value.slice(2)) : value;
  return fromPath(expanded, env);
}

function directories(parent: string): string[] {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((entry) => {
        if(entry.isDirectory())return true;
        try{return entry.isSymbolicLink()&&statSync(path.join(parent,entry.name)).isDirectory();}catch{return false;}
      })
      .map((entry) => path.join(parent, entry.name));
  } catch {
    return [];
  }
}

function protonCandidates(home: string): {command:string;steamRoot:string}[] {
  const steamRoots = [
    path.join(home, ".local", "share", "Steam"),
    path.join(home, ".steam", "root"),
    path.join(home, ".steam", "steam"),
    path.join(home, ".var", "app", "com.valvesoftware.Steam", "data", "Steam"),
    path.join(home, ".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam"),
  ];
  const clients = new Map(steamRoots.map(root => [root,root]));
  const out: {command:string;steamRoot:string}[] = [];
  // Steam Deck can keep Proton on an SD-card library instead of the internal SSD.
  for (const root of [...steamRoots]) {
    try {
      const file = path.join(root, "steamapps", "libraryfolders.vdf");
      if (statSync(file).size > 256 * 1024) continue;
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/"path"\s*"([^"\r\n]+)"/g)) {
        const library = match[1].replace(/\\\\/g, "\\");
        if (path.isAbsolute(library) && !steamRoots.includes(library) && steamRoots.length < 32) {
          steamRoots.push(library);clients.set(library,root);
        }
      }
    } catch { /* Missing or inaccessible library indexes must not block other runtimes. */ }
  }
  for (const root of steamRoots) {
    const add = (dir:string) => out.push({command:path.join(dir,"proton"),steamRoot:clients.get(root)!});
    for (const dir of directories(path.join(root, "compatibilitytools.d"))) add(dir);
    for (const dir of directories(path.join(root, "steamapps", "common"))) {
      if (/^(?:proton|ge-proton)/i.test(path.basename(dir))) add(dir);
    }
  }
  return out.filter(p=>executable(p.command)).sort((a, b) => b.command.localeCompare(a.command, undefined, { numeric: true, sensitivity: "base" }));
}

function lutrisWineCandidates(home: string): string[] {
  const root = path.join(home, ".local", "share", "lutris", "runners", "wine");
  const out: string[] = [];
  for (const dir of directories(root)) {
    for (const name of ["wine64", "wine"]) {
      const candidate = path.join(dir, "bin", name);
      if (executable(candidate)) out.push(candidate);
    }
  }
  return out.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" }));
}

function steamRootFor(proton: string): string | null {
  let current = path.dirname(proton);
  for (let i = 0; i < 8; i++) {
    if (path.basename(current) === "compatibilitytools.d") return path.dirname(current);
    if (path.basename(current) === "common" && path.basename(path.dirname(current)) === "steamapps") {
      return path.dirname(path.dirname(current));
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function dllOverrides(existing: string | undefined): string {
  const parts = (existing ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^dxgi=/i.test(part));
  parts.push("dxgi=n,b");
  return parts.join(";");
}

function withXwaylandAuthority(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env.XAUTHORITY || env.XDG_SESSION_TYPE?.toLowerCase() !== "wayland" || !env.XDG_RUNTIME_DIR) return env;

  try {
    const candidates = readdirSync(env.XDG_RUNTIME_DIR)
      .filter((name) => name.startsWith(".mutter-Xwaylandauth."))
      .map((name) => path.join(env.XDG_RUNTIME_DIR!, name))
      .filter((file) => statSync(file).isFile())
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    if (candidates[0]) return { ...env, XAUTHORITY: candidates[0] };
  } catch {
    // Keep the original environment; Wine will report the display error if XWayland is unavailable.
  }

  return env;
}

export function detectLinuxRuntime(
  userDataDir: string,
  env: NodeJS.ProcessEnv = process.env,
  home: string = env.HOME ?? os.homedir(),
): DetectedLinuxRuntime | null {
  const gameEnv = { ...env };
  // The Linux bootstrap withholds Steam's overlay from Electron, not the game
  // or Steam Input. Restore it without dropping Steam/controller/runtime vars.
  if (gameEnv.DR_GAME_LD_PRELOAD !== undefined) {
    if (gameEnv.DR_GAME_LD_PRELOAD) gameEnv.LD_PRELOAD = gameEnv.DR_GAME_LD_PRELOAD;
    else delete gameEnv.LD_PRELOAD;
    delete gameEnv.DR_GAME_LD_PRELOAD;
  }
  const runtimeEnv = withXwaylandAuthority(gameEnv);
  const explicitProton = customRuntime(runtimeEnv.DAUNTLESS_UNBROKEN_PROTON, runtimeEnv);
  const explicitWine = customRuntime(runtimeEnv.DAUNTLESS_UNBROKEN_WINE, runtimeEnv);
  const candidate = explicitProton || explicitWine ? undefined : protonCandidates(home)[0];
  const proton = explicitProton ?? candidate?.command ?? null;
  if (proton) {
    const compatDataDir = path.join(userDataDir, "compat", "proton");
    const steamRoot = candidate?.steamRoot ?? steamRootFor(proton);
    return {
      kind: "proton",
      name: `Proton (${path.basename(path.dirname(proton))})`,
      command: proton,
      prefixDir: path.join(compatDataDir, "pfx"),
      compatDataDir,
      env: {
        ...runtimeEnv,
        STEAM_COMPAT_DATA_PATH: compatDataDir,
        ...(steamRoot ? { STEAM_COMPAT_CLIENT_INSTALL_PATH: steamRoot } : {}),
        STEAM_COMPAT_APP_ID: "0",
        PROTON_LOG: "0",
        WINEDLLOVERRIDES: dllOverrides(runtimeEnv.WINEDLLOVERRIDES),
      },
    };
  }

  const wine =
    explicitWine ??
    fromPath("wine64", runtimeEnv) ??
    fromPath("wine", runtimeEnv) ??
    lutrisWineCandidates(home)[0] ??
    null;
  if (!wine) return null;
  const prefixDir = path.join(userDataDir, "compat", "wine");
  return {
    kind: "wine",
    name: `Wine (${path.basename(path.dirname(wine)) || "system"})`,
    command: wine,
    prefixDir,
    compatDataDir: null,
    env: {
      ...runtimeEnv,
      WINEPREFIX: prefixDir,
      WINEDEBUG: runtimeEnv.WINEDEBUG ?? "-all",
      WINEDLLOVERRIDES: dllOverrides(runtimeEnv.WINEDLLOVERRIDES),
    },
  };
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { env, cwd, timeout: 120_000, windowsHide: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function initialize(runtime: DetectedLinuxRuntime, home: string): Promise<void> {
  if (existsSync(path.join(runtime.prefixDir, "drive_c"))) return;
  if (runtime.kind === "proton") {
    if (runtime.compatDataDir) mkdirSync(runtime.compatDataDir, { recursive: true });
    await run(runtime.command, ["run", "cmd", "/c", "exit"], runtime.env, home);
    return;
  }
  const beside = path.join(path.dirname(runtime.command), "wineboot");
  const wineboot = executable(beside) ? beside : fromPath("wineboot", runtime.env);
  if (wineboot) await run(wineboot, ["-u"], runtime.env, home);
  else await run(runtime.command, ["wineboot", "-u"], runtime.env, home);
}

function wineUser(runtime: DetectedLinuxRuntime, env: NodeJS.ProcessEnv): string {
  if (runtime.kind === "proton") return "steamuser";
  const raw = env.USER ?? env.LOGNAME ?? "wineuser";
  return raw.replace(/[\\/:*?"<>|]/g, "_").slice(0, 64) || "wineuser";
}

export interface PrepareLinuxGameLaunchOptions {
  autoInstallRuntime?: boolean;
}

export async function prepareLinuxGameLaunch(
  userDataDir: string,
  env: NodeJS.ProcessEnv = process.env,
  home: string = env.HOME ?? os.homedir(),
  options: PrepareLinuxGameLaunchOptions = {},
): Promise<PreparedLinuxGameLaunch> {
  let detected = detectLinuxRuntime(userDataDir, env, home);
  if (!detected && options.autoInstallRuntime && env.DAUNTLESS_UNBROKEN_AUTO_INSTALL !== "0") {
    const plan = linuxDependencyInstallPlan("runtime", env);
    if (plan) {
      log.info(`no Proton/Wine runtime found; installing Wine with ${plan.name}`);
      try {
        await runLinuxDependencyInstall(plan, env, home);
        log.info("Wine dependency install finished; detecting runtime again");
      } catch (e) {
        log.warn(`automatic Wine install failed: ${describeError(e)}`);
      }
      detected = detectLinuxRuntime(userDataDir, env, home);
    }
  }
  if (!detected) throw new LinuxRuntimeMissingError();
  await initialize(detected, home);
  const user = wineUser(detected, env);
  const configDir = path.join(detected.prefixDir, "drive_c", "users", user, "AppData", "Local", "Archon", "Saved", "Config", "WindowsClient");
  return {
    runtime: {
      command: detected.command,
      argsPrefix: detected.kind === "proton" ? ["run"] : [],
      env: detected.env,
    },
    configDir,
    runtimeName: detected.name,
  };
}
