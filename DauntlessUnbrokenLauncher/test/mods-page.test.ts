import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { STRINGS } from "../src/shared/i18n";
import { LANGUAGES } from "../src/shared/types";

const ROOT = path.resolve(__dirname, "..", "..");
const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
const renderer = readFileSync(path.join(ROOT, "src", "renderer", "index.ts"), "utf8");
const css = readFileSync(path.join(ROOT, "src", "renderer", "styles.css"), "utf8");

test("Client Mods keeps its navigation and credits anxo0 for Lock-on", () => {
  assert.match(html, /id="view-mods" aria-labelledby="mods-title" hidden><\/section>\s*<section class="view" id="view-settings"/);
  assert.match(renderer, /\{ view: "mods", icon: "puzzle", key: "nav_mods" \},\s*\{ view: "settings"/);
  assert.match(renderer, /function renderMods\(\): void/);
  assert.match(renderer, /if \(state\.view === "mods"\) renderMods\(\);/);
  assert.match(css, /\.mods-overview\s*\{/);
  assert.match(css, /\.mods-grid\s*\{/);
  assert.equal(STRINGS.en.mods_title, "Client Mods");
  assert.doesNotMatch(renderer, /t\("mods_(badge|by|credit)"\)|ZFXSTATIC/i);
  assert.match(renderer, /open\("creator_anxo"\)/);
  assert.match(renderer, /ANXO_FEATURES/);
  for (const lang of LANGUAGES) {
    for (const [key, text] of Object.entries(STRINGS[lang])) {
      assert.doesNotMatch(text, /ZFXSTATIC/i, `${lang}.${key}`);
    }
  }
});

test("the shipped Lua menu uses Client Mods and preserves its settings controls", () => {
  const menu = readFileSync(path.join(ROOT, "..", "client-mods", "ue4ss", "Mods", "ModMenu", "Scripts", "main.lua"), "utf8");
  assert.match(menu, /MakeLabel\("Client mods", TITLE_SIZE/);
  assert.doesNotMatch(menu, /ZFXSTATIC|SIGNATURE/i);
  for (const key of ["bhb_shield", "bhb_text", "bhb_dual", "trk_always", "cst_color", "lock_rebind"]) {
    assert.ok(menu.includes(`key = "${key}"`), `${key} remains available`);
  }
  assert.match(menu, /local choice = s\.choices\[n\] or s\.choices\[s\.default\]/);
  assert.match(menu, /ShownValue\(it\.setting\)/);
  assert.match(menu, /MakeLabel\("YOUR MODS"/);
  const navigation = menu.match(/local function Move\(d\)([\s\S]*?)\nlocal function SwitchMod/);
  assert.ok(navigation, "navigation function is present");
  assert.match(navigation[1], /ShowPage\(activeMod\)/);
  assert.doesNotMatch(navigation[1], /BuildUI|DestroyUI/, "moving selection must preserve the menu widgets");
});
