import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const renderer = readFileSync(path.join(path.resolve(__dirname, "..", ".."), "src", "renderer", "index.ts"), "utf8");

test("maintenance copy uses the selected server name", () => {
  assert.match(renderer, /const maintenanceName = serverName\(\);/);
  assert.match(renderer, /t\("maintenance_offline", \{ name: maintenanceName \}\)/);
  assert.doesNotMatch(renderer, /"EU1 is under maintenance"/);
  assert.doesNotMatch(renderer, /"EU1 is offline"/);
});

test("maintenance surfaces use the translation catalog", () => {
  assert.match(renderer, /t\("maintenance"\)/);
  assert.match(renderer, /t\("maintenance_offline", \{ name: serverName\(\) \}\)/);
  assert.match(renderer, /t\("maintenance_worlds"\)/);
  assert.match(renderer, /t\("maintenance_posts"\)/);
});

test("posts view does not show an empty-state maintenance banner over available posts", () => {
  assert.match(renderer, /else if \(state\.news\.length === 0\) \{\r?\n      if \(snap\.status\?\.maintenance\) body\.push\(card\("community-maintenance"/);
  assert.doesNotMatch(renderer, /else \{\r?\n      if \(snap\.status\?\.maintenance && state\.news\.length === 0\)/);
});

test("posts view rerenders when maintenance changes", () => {
  assert.match(renderer, /const sig = JSON\.stringify\(\[state\.lang, state\.news, snap\?\.server\?\.name \?\? null, snap\?\.status\?\.name \?\? null, snap\?\.status\?\.maintenance \?\? false\]\);/);
});

test("play view rerenders when maintenance changes", () => {
  assert.match(renderer, /snap\.status\?\.registration \?\? null,\r?\n\s+snap\.status\?\.name \?\? null,\r?\n\s+snap\.status\?\.maintenance \?\? false,/);
});

test("maintenance action bar does not tell players to press PLAY", () => {
  assert.match(renderer, /const actionHintText = snap\.status\?\.maintenance \? t\("maintenance"\) : snap\.lastError\?\.code === "launch_failed" \? t\("launch_failed_short"\) : actionHint\(snap\);/);
  assert.match(renderer, /icon\(snap\.status\?\.maintenance \? "warning" : snap\.phase === "ready"/);
  assert.match(renderer, /h\("span", \{ class: "action-hint" \}, actionHintText\)/);
  assert.match(renderer, /announce\(actionHintText\);/);
});

test("launch-failure action bar uses compact status copy", () => {
  assert.match(renderer, /const actionHintText = snap\.status\?\.maintenance \? t\("maintenance"\) : snap\.lastError\?\.code === "launch_failed" \? t\("launch_failed_short"\) : actionHint\(snap\);/);
});

test("launch failures expose the repair action", () => {
  assert.match(renderer, /error\.code === 'launch_failed'/);
  assert.match(renderer, /api\.repair\(\)/);
});

test("launch failures expose the game-folder recovery action", () => {
  assert.match(renderer, /error\.code === 'launch_failed' \? \[button\(t\("set_repair"\)[\s\S]*?button\(t\("set_change_folder"\), \(\) => void api\.chooseInstallDir\(\)/);
});

test("launch failures replace ready-state copy", () => {
  assert.match(renderer, /const launchFailed = snap\.lastError\?\.code === "launch_failed"/);
  assert.match(renderer, /launchFailed \? t\("launch_failed_short"\)/);
  assert.match(renderer, /launchFailed \? t\("ready_launch_failed"\)/);
  assert.match(renderer, /if \(snap\.lastError\?\.code === "launch_failed"\) return t\("ready_launch_failed"\)/);
  assert.match(renderer, /const launchFailed = snap\?\.lastError\?\.code === "launch_failed"/);
  assert.match(renderer, /launchFailed \? `\$\{t\("sp_online"\)\} · \$\{t\("launch_failed_short"\)\}`/);
});

test("the library rail uses compact launch-failure copy", () => {
  assert.match(renderer, /launchFailed \? `\$\{t\("sp_online"\)\} · \$\{t\("launch_failed_short"\)\}`/);
});

test("launch failures expose the support diagnostics path", () => {
  assert.match(renderer, /t\("set_support_diagnostics"\)/);
  assert.match(renderer, /button\(t\("set_troubleshooting"\), openSupportDiagnostics/);
  assert.match(renderer, /state\.settingsTab = "game";/);
  assert.match(renderer, /setView\("settings"\)/);
});

test("launch failures expose the launcher log folder", () => {
  assert.match(renderer, /error\.code === 'launch_failed' \? \[button\(t\("set_repair"\)[^;]*?button\(t\("set_open_log"\),\s*\(\)\s*=>\s*void openSupportLogFolder\(\)[^;]*?\] : \[\]\)/);
});

test("log-folder failures return to the diagnostics settings surface", () => {
  assert.match(renderer, /catch\{[^}]*\}\s*state\.settingsTab="game";setView\("settings"\);state\.diagnosticsNote=t\("diag_log_open_failed"\)/);
});

test("support diagnostics controls use translated copy", () => {
  assert.match(renderer, /settingsRow\(t\("set_support_diagnostics"\),state\.diagnosticsNote\|\|t\("diag_description"\)/);
  assert.match(renderer, /button\(t\("diag_upload"\),/);
  assert.match(renderer, /button\(t\("diag_save_local"\),/);
});

test("support diagnostics status messages use translated copy", () => {
  assert.match(renderer, /state\.diagnosticsNote=t\("diag_prepare"\)/);
  assert.match(renderer, /t\("diag_uploaded",\{id:result\.id\}\)/);
  assert.match(renderer, /t\("diag_upload_failed"\)/);
});
