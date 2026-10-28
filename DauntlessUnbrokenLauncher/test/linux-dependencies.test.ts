import { test } from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { linuxDependencyInstallPlan, steamOsPasswordStore,linuxStorageSwitch,readLinuxStoragePreference,rememberLinuxStoragePreference } from "../src/main/linux-dependencies";

test('Linux keeps its working desktop backend across sessions and never selects basic storage',()=>{
  const root=mkdtempSync(path.join(tmpdir(),'unbroken-keyring-')),file=path.join(root,'linux-keyring.json');
  try {
    assert.equal(readLinuxStoragePreference(file),null);
    for(const backend of ['gnome_libsecret','kwallet5','kwallet6']){
      rememberLinuxStoragePreference(file,backend);
      assert.equal(readLinuxStoragePreference(file),linuxStorageSwitch(backend));
    }
    for(const backend of ['basic_text','basic','unknown','__proto__']){
      assert.equal(linuxStorageSwitch(backend),null);
      writeFileSync(file,JSON.stringify({version:1,backend}));assert.equal(readLinuxStoragePreference(file),null);
    }
    writeFileSync(file,'broken JSON');assert.equal(readLinuxStoragePreference(file),null);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('SteamOS chooses the installed KDE wallet consistently across desktop and Gamescope sessions',()=>{
  assert.equal(steamOsPasswordStore('ID=steamos\n',true,true),'kwallet6');
  assert.equal(steamOsPasswordStore('ID="steamos"\n',false,true),'kwallet5');
  assert.equal(steamOsPasswordStore('ID=steamos\n',false,false),null);
  assert.equal(steamOsPasswordStore('ID=ubuntu\n',true,true),null);
  assert.equal(steamOsPasswordStore('ID=arch\nID_LIKE=steamos\n',true,true),null);
});

function executable(file: string): string {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "#!/bin/sh\nexit 0\n");
  chmodSync(file, 0o755);
  return file;
}

test('SteamOS never attempts automatic system package installation',()=>{
  for(const kind of ['runtime','secure-storage'] as const){
    assert.equal(linuxDependencyInstallPlan(kind,process.env,'NAME=SteamOS\nID=steamos\n'),null);
    assert.equal(linuxDependencyInstallPlan(kind,process.env,'ID="steamos"\n'),null);
  }
});

test("Linux dependencies: apt runtime install is fixed and elevated", { skip: process.platform !== "linux" }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "dr-linux-deps-"));
  try {
    const apt = executable(path.join(root, "apt-get"));
    const pkexec = executable(path.join(root, "pkexec"));
    const plan = linuxDependencyInstallPlan("runtime", { PATH: root, HOME: root });
    assert.equal(plan?.command, pkexec);
    assert.deepEqual(plan?.args, [apt, "install", "-y", "wine64"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("Linux dependencies: secure storage installs keyring and libsecret", { skip: process.platform !== "linux" }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "dr-linux-deps-"));
  try {
    const apt = executable(path.join(root, "apt-get"));
    const pkexec = executable(path.join(root, "pkexec"));
    const plan = linuxDependencyInstallPlan("secure-storage", { PATH: root, HOME: root });
    assert.equal(plan?.command, pkexec);
    assert.deepEqual(plan?.args, [apt, "install", "-y", "gnome-keyring", "libsecret-1-0"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
