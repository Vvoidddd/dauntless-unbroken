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

test("Client Mods keeps its navigation and shows feature descriptions without author promotions", () => {
  assert.match(html, /id="view-mods" aria-labelledby="mods-title" hidden><\/section>\s*<section class="view" id="view-settings"/);
  assert.match(renderer, /\{ view: "mods", icon: "puzzle", key: "nav_mods" \},\s*\{ view: "settings"/);
  assert.match(renderer, /function renderMods\(\): void/);
  assert.match(renderer, /if \(state\.view === "mods"\) renderMods\(\);/);
  assert.match(css, /\.mods-overview\s*\{/);
  assert.match(css, /\.mods-grid\s*\{/);
  assert.equal(STRINGS.en.mods_title, "Client Mods");
  assert.doesNotMatch(renderer, /mods_badge|mods_by|mods_credit|mod-by|ZFXSTATIC/i);
  for (const lang of LANGUAGES) {
    for (const [key, text] of Object.entries(STRINGS[lang])) {
      assert.doesNotMatch(text, /ZFXSTATIC/i, `${lang}.${key}`);
    }
  }
});

test("the shipped Lua menu uses Client Mods and preserves its settings controls", () => {
  const menu = readFileSync(path.join(ROOT, "..", "client-mods", "ue4ss", "Mods", "ModMenu", "Scripts", "main.lua"), "utf8");
  assert.match(menu, /MakeLabel\("CLIENT MODS", TITLE_SIZE/);
  assert.doesNotMatch(menu, /ZFXSTATIC|SIGNATURE/i);
  assert.match(menu, /MakeLabelRight\(ch\.name/);
  assert.match(menu, /MakeLabel\("SETTINGS"/);
});
