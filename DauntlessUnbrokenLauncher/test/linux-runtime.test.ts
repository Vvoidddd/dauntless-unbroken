import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync,symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { detectLinuxRuntime, prepareLinuxGameLaunch } from "../src/main/linux-runtime";

function executable(file: string): string {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "#!/bin/sh\nexit 0\n");
  chmodSync(file, 0o755);
  return file;
}

test('the game restores the withheld overlay and retains Steam Input/runtime environment',()=>{
  const home=mkdtempSync(path.join(tmpdir(),'unbroken-overlay-'));
  try{
    const proton=executable(path.join(home,'Proton','proton'));
    const original='/steam/ubuntu12_64/gameoverlayrenderer.so:/other/library.so';
    const env={HOME:home,PATH:'',DAUNTLESS_UNBROKEN_PROTON:proton,LD_PRELOAD:'/other/library.so',DR_GAME_LD_PRELOAD:original,SteamAppId:'123',SteamGameId:'456',STEAM_GAMEPADUI:'1',SDL_GAMECONTROLLERCONFIG:'mapping',LD_LIBRARY_PATH:'/steam/runtime'};
    const runtime=detectLinuxRuntime(path.join(home,'data'),env,home)!;
    assert.equal(runtime.env.LD_PRELOAD,original);assert.equal(runtime.env.DR_GAME_LD_PRELOAD,undefined);
    for(const name of ['SteamAppId','SteamGameId','STEAM_GAMEPADUI','SDL_GAMECONTROLLERCONFIG','LD_LIBRARY_PATH'] as const)assert.equal(runtime.env[name],env[name]);
    assert.equal(env.LD_PRELOAD,'/other/library.so','launcher environment must remain filtered');
  }finally{rmSync(home,{recursive:true,force:true});}
});

test('Steam Proton directory links are discovered and broken links are skipped',()=>{
  const home=mkdtempSync(path.join(tmpdir(),'unbroken-linked-proton-'));
  try{
    const tools=path.join(home,'.local/share/Steam/compatibilitytools.d');mkdirSync(tools,{recursive:true});
    const target=path.join(home,'external','GE-Proton10');executable(path.join(target,'proton'));
    const linked=path.join(tools,'GE-Proton10');symlinkSync(target,linked,process.platform==='win32'?'junction':'dir');
    symlinkSync(path.join(home,'missing'),path.join(tools,'GE-Proton99'),process.platform==='win32'?'junction':'dir');
    assert.equal(detectLinuxRuntime(path.join(home,'data'),{HOME:home,PATH:''},home)?.command,path.join(linked,'proton'));
  }finally{rmSync(home,{recursive:true,force:true});}
});

test('Steam Deck finds Proton in an SD-card library listed by Steam',()=>{
  const home=mkdtempSync(path.join(tmpdir(),'unbroken-deck-library-'));
  try {
    const steam=path.join(home,'.local','share','Steam');
    const library=path.join(home,'SD Card','SteamLibrary');
    mkdirSync(path.join(steam,'steamapps'),{recursive:true});
    writeFileSync(path.join(steam,'steamapps','libraryfolders.vdf'),`"libraryfolders" { "1" { "path" "${library.replace(/\\/g,'\\\\')}" } }`);
    const proton=executable(path.join(library,'steamapps','common','Proton 10.0','proton'));
    const runtime=detectLinuxRuntime(path.join(home,'data'),{HOME:home,USER:'deck',PATH:''},home);
    assert.equal(runtime?.command,proton);
    assert.equal(runtime?.kind,'proton');
    assert.equal(runtime?.env.STEAM_COMPAT_CLIENT_INSTALL_PATH,steam);
    assert.equal(runtime?.env.STEAM_COMPAT_DATA_PATH,path.join(home,'data','compat','proton'));
  }finally{rmSync(home,{recursive:true,force:true});}
});

test("Linux runtime: explicit Wine overrides auto-detected Proton", () => {
  const home = mkdtempSync(path.join(tmpdir(), "dr-linux-runtime-"));
  try {
    const wine = executable(path.join(home, "custom", "wine64"));
    executable(path.join(home, ".local", "share", "Steam", "compatibilitytools.d", "GE-Proton99", "proton"));
    const userData = path.join(home, "data");
    const runtime = detectLinuxRuntime(userData, { HOME: home, USER: "slayer", PATH: "", DAUNTLESS_UNBROKEN_WINE: wine }, home);
    assert.equal(runtime?.kind, "wine");
    assert.equal(runtime?.command, wine);
    assert.equal(runtime?.env.WINEPREFIX, path.join(userData, "compat", "wine"));
    assert.match(runtime?.env.WINEDLLOVERRIDES ?? "", /(?:^|;)dxgi=n,b(?:;|$)/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Linux runtime: auto-detects Steam compatibility tools and prepares Proton environment", () => {
  const home = mkdtempSync(path.join(tmpdir(), "dr-linux-proton-"));
  try {
    const proton = executable(path.join(home, ".local", "share", "Steam", "compatibilitytools.d", "GE-Proton10-1", "proton"));
    const userData = path.join(home, "data");
    const runtime = detectLinuxRuntime(userData, { HOME: home, USER: "slayer", PATH: "" }, home);
    assert.equal(runtime?.kind, "proton");
    assert.equal(runtime?.command, proton);
    assert.equal(runtime?.compatDataDir, path.join(userData, "compat", "proton"));
    assert.equal(runtime?.prefixDir, path.join(userData, "compat", "proton", "pfx"));
    assert.equal(runtime?.env.STEAM_COMPAT_DATA_PATH, path.join(userData, "compat", "proton"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Linux runtime: auto-detects Proton from Flatpak Steam", () => {
  const home = mkdtempSync(path.join(tmpdir(), "dr-linux-flatpak-proton-"));
  try {
    const root = path.join(home, ".var", "app", "com.valvesoftware.Steam", "data", "Steam");
    const proton = executable(path.join(root, "steamapps", "common", "Proton - Experimental", "proton"));
    const runtime = detectLinuxRuntime(path.join(home, "data"), { HOME: home, USER: "slayer", PATH: "" }, home);
    assert.equal(runtime?.kind, "proton");
    assert.equal(runtime?.command, proton);
    assert.equal(runtime?.env.STEAM_COMPAT_CLIENT_INSTALL_PATH, root);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Linux runtime: recovers GNOME XWayland authorization when XAUTHORITY is missing", () => {
  const home = mkdtempSync(path.join(tmpdir(), "dr-linux-xauth-"));
  try {
    const proton = executable(path.join(home, ".local", "share", "Steam", "compatibilitytools.d", "GE-Proton10-1", "proton"));
    const runtimeDir = path.join(home, "runtime");
    mkdirSync(runtimeDir, { recursive: true });
    const authority = path.join(runtimeDir, ".mutter-Xwaylandauth.TEST");
    writeFileSync(authority, "cookie");

    const runtime = detectLinuxRuntime(
      path.join(home, "data"),
      { HOME: home, USER: "slayer", PATH: "", XDG_SESSION_TYPE: "wayland", XDG_RUNTIME_DIR: runtimeDir },
      home,
    );
    assert.equal(runtime?.command, proton);
    assert.equal(runtime?.env.XAUTHORITY, authority);

    const explicit = detectLinuxRuntime(
      path.join(home, "data2"),
      { HOME: home, USER: "slayer", PATH: "", XDG_SESSION_TYPE: "wayland", XDG_RUNTIME_DIR: runtimeDir, XAUTHORITY: "/explicit/xauth" },
      home,
    );
    assert.equal(explicit?.env.XAUTHORITY, "/explicit/xauth");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Linux runtime: creates the Proton compat-data directory before first initialization", { skip: process.platform !== "linux" }, async () => {
  const home = mkdtempSync(path.join(tmpdir(), "dr-linux-proton-init-"));
  try {
    const proton = path.join(home, "custom", "proton");
    mkdirSync(path.dirname(proton), { recursive: true });
    writeFileSync(
      proton,
      "#!/bin/sh\n[ -d \"$STEAM_COMPAT_DATA_PATH\" ] || exit 42\n/bin/mkdir -p \"$STEAM_COMPAT_DATA_PATH/pfx/drive_c\"\n",
    );
    chmodSync(proton, 0o755);
    const userData = path.join(home, "data");
    const prepared = await prepareLinuxGameLaunch(
      userData,
      { HOME: home, USER: "slayer", PATH: "", DAUNTLESS_UNBROKEN_PROTON: proton },
      home,
      { autoInstallRuntime: false },
    );
    assert.equal(prepared.runtimeName, "Proton (custom)");
    assert.equal(prepared.configDir, path.join(userData, "compat", "proton", "pfx", "drive_c", "users", "steamuser", "AppData", "Local", "Archon", "Saved", "Config", "WindowsClient"));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
