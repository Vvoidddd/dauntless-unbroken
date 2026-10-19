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
