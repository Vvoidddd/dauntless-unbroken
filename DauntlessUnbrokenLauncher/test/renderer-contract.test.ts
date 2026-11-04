import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..", "..");
test("launcher layout retains unique controls used by the renderer", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, "duplicate IDs can bind controls to the wrong element");
  for (const id of ["nav", "account-chip", "primary", "action-info", "action-live", "modal-root", "win-min", "win-max", "win-close", "view-play", "view-settings", "lang-switch"]) {
    assert.ok(ids.includes(id), `missing renderer control ${id}`);
  }
});

test("both local fonts and their complete licenses ship with the launcher", () => {
  const css = readFileSync(path.join(root, "src/renderer/unbroken-theme.css"), "utf8");
  for (const font of ["Sora", "Manrope"]) {
    assert.ok(css.includes(`./fonts/${font}-Variable.ttf`));
    assert.ok(existsSync(path.join(root, `src/renderer/fonts/${font}-Variable.ttf`)));
    assert.match(readFileSync(path.join(root, `assets/font-licenses/${font}-OFL.txt`), "utf8"), /SIL OPEN FONT LICENSE/);
  }
  assert.match(readFileSync(path.join(root, "forge.config.ts"), "utf8"), /"assets\/font-licenses"/);
});

test("the news page keeps long updates in a readable branded surface", () => {
  const source = readFileSync(path.join(root, "src/renderer/index.ts"), "utf8");
  const styles = readFileSync(path.join(root, "src/renderer/styles.css"), "utf8");
  assert.match(source, /class: "page news-page"/);
  assert.match(source, /LATEST POST/);
  assert.match(source, /New post/);
  assert.match(styles, /\.news-page\s*\{/);
  assert.match(styles, /\.news-page \.news-item::before\s*\{/);
});

test("the ready play view has a focused library home surface", () => {
  const source = readFileSync(path.join(root, "src/renderer/index.ts"), "utf8");
  const styles = readFileSync(path.join(root, "src/renderer/unbroken-theme.css"), "utf8");
  assert.match(source, /class: `play-content \$\{playClass\}`/);
  assert.match(source, /const playClass = state\.offlineView \? "play-offline"/);
  assert.match(styles, /\.play-home\s*\{/);
  assert.match(styles, /\.play-home \.hero-title\s*\{/);
});

test("the launcher navigation keeps a readable library rail", () => {
  const styles = readFileSync(path.join(root, "src/renderer/unbroken-theme.css"), "utf8");
  assert.match(styles, /:root\[data-style="unbroken"\][\s\S]*--rail-w: 204px/);
  assert.match(styles, /\.nav-item \{ display: flex; flex-direction: row;/);
  assert.match(styles, /\.nav-item\[aria-current="page"\]::before \{ left: 0;/);
});

test("the rail exposes the installed game as a library selection", () => {
  const html = readFileSync(path.join(root, "index.html"), "utf8");
  const source = readFileSync(path.join(root, "src/renderer/index.ts"), "utf8");
  const styles = readFileSync(path.join(root, "src/renderer/unbroken-theme.css"), "utf8");
  assert.match(html, /id="library-game"/);
  assert.match(source, /#library-game/);
  assert.match(styles, /\.library-game\s*\{/);
});
