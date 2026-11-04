import {test} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(__dirname, "..", "..");
const renderer = readFileSync(path.join(ROOT, "src", "renderer", "index.ts"), "utf8");
const theme = readFileSync(path.join(ROOT, "src", "renderer", "unbroken-theme.css"), "utf8");
const html = readFileSync(path.join(ROOT, "index.html"), "utf8");

test("the library home has a dedicated game banner", () => {
  assert.match(renderer, /play-cover/);
  assert.match(renderer, /play-cover-build/);
  assert.match(theme, /\.play-cover/);
  assert.match(theme, /hero-umbral-nayzaga\.jpg/);
});

test("the selected library tile reflects maintenance state", () => {
  assert.match(renderer, /libraryState\.textContent = snap\?\.status\?\.maintenance/);
  assert.match(renderer, /is-maintenance/);
  assert.match(theme, /\.library-game-state\.is-maintenance/);
});

test("the PLAY menu has a compact section label", () => {
  assert.match(renderer, /play-menu-kicker/);
  assert.match(renderer, /PLAY OPTIONS/);
  assert.match(theme, /\.play-menu-kicker/);
});

test("new community content marks both navigation levels", () => {
  assert.match(html, /titlebar-nav-badge/);
  assert.match(renderer, /titlebarNews/);
  assert.match(theme, /\.titlebar-nav-badge/);
});
