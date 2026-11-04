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
  assert.match(renderer, /news-media/);
  assert.match(theme, /\.news-media/);
});

test("the mods overview keeps a game-art anchor above its feature grid", () => {
  assert.match(renderer, /mods-cover/);
  assert.match(renderer, /behemothArt/);
  assert.match(theme, /\.mods-cover/);
});
