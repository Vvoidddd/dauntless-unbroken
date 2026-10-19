import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..", "..");
const html = readFileSync(path.join(ROOT, "index.html"), "utf8");
const renderer = readFileSync(path.join(ROOT, "src", "renderer", "index.ts"), "utf8");
const css = readFileSync(path.join(ROOT, "src", "renderer", "styles.css"), "utf8");

test("the launcher has no hosting advertisements, partner page or promotion assets", () => {
  for (const text of [html, renderer, css]) assert.doesNotMatch(text, /eugamehost|EU Gamehost|partnerBanner|view-partners|partner-banner/i);
  assert.ok(!existsSync(path.join(ROOT, "src", "renderer", "brand", "eugamehost-partner.png")));
});

test("Discord and Patreon rail buttons use bundled local brand marks", () => {
  assert.match(html, /class="social-button" id="discord-btn"/);
  assert.match(html, /class="social-icon social-icon-discord"/);
  assert.match(html, /class="social-button" id="patreon-btn"/);
  assert.match(html, /class="social-icon social-icon-patreon"/);
  for (const file of ["discord-mark.svg", "discord.svg", "patreon-mark.svg", "patreon.png"]) {
    const full = path.join(ROOT, "src", "renderer", "brand", file);
    assert.ok(existsSync(full), `${file} is missing`);
    assert.ok(statSync(full).size > 100, `${file} is unexpectedly small`);
  }
  assert.match(css, /url\("\.\/brand\/discord-mark\.svg"\)/);
  assert.match(css, /url\("\.\/brand\/patreon-mark\.svg"\)/);
  assert.doesNotMatch(html, /discord-dot/);
});
