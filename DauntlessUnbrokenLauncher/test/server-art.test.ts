import {test} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(__dirname, "..", "..");
const renderer = readFileSync(path.join(ROOT, "src", "renderer", "index.ts"), "utf8");
const theme = readFileSync(path.join(ROOT, "src", "renderer", "unbroken-theme.css"), "utf8");

test("hunt worlds use the bundled behemoth artwork", () => {
  assert.match(renderer, /behemoth-512\.png/);
  assert.match(renderer, /instance-behemoth/);
  assert.match(renderer, /i\.kind === "hunt"/);
  assert.match(theme, /\.instance-behemoth/);
});

test("news uses a bundled game item as a visual lead", () => {
  assert.match(renderer, /trials-repeater\.png/);
  assert.match(renderer, /hero-umbral-nayzaga\.jpg/);
  assert.match(renderer, /newsArtFor/);
  assert.match(renderer, /news-teaser-media/);
  assert.match(renderer, /community-cover/);
  assert.match(renderer, /news-media/);
  assert.match(theme, /\.news-media/);
});

test("the mods overview keeps a game-art anchor above its feature grid", () => {
  assert.match(renderer, /mods-cover/);
  assert.match(renderer, /behemothArt/);
  assert.match(theme, /\.mods-cover/);
});

test("the account popover shows the current connection before switch actions", () => {
  assert.match(renderer, /server-menu-current/);
  assert.match(renderer, /CONNECTED/);
  assert.match(renderer, /Online · \$\{/);
  assert.match(renderer, /"Public"/);
  assert.match(theme, /\.server-menu-current/);
  assert.match(renderer, /server-menu-status-dot/);
  assert.match(renderer, /server-menu-profile/);
  assert.match(renderer, /Friends only/);
  assert.match(theme, /\.server-menu-status-dot/);
  assert.match(theme, /\.server-menu-profile/);
});

test("the player roster can show the local approved avatar without exposing other pictures", () => {
  assert.match(renderer, /player-avatar-image/);
  assert.match(renderer, /const currentUser = state\.snap\?\.account\.username/);
  assert.match(renderer, /p\.name === currentUser/);
  assert.match(theme, /\.player-avatar-image/);
});

test("the server view replaces live-world data with maintenance state", () => {
  assert.match(renderer, /status\?\.maintenance/);
  assert.match(renderer, /maintenance-worlds/);
  assert.match(renderer, /server-cover/);
  assert.match(renderer, /server-cover-status/);
  assert.match(theme, /\.maintenance-worlds/);
  assert.match(theme, /\.server-cover/);
});

test("the local preview can render the maintenance state", () => {
  assert.match(renderer, /PREVIEW_MAINTENANCE/);
  assert.match(renderer, /mode.*maintenance/);
});

test("maintenance home copy does not claim the game is ready", () => {
  assert.match(renderer, /EU1 is under maintenance/);
  assert.match(renderer, /The server is offline/);
  assert.match(renderer, /underMaintenance/);
});
