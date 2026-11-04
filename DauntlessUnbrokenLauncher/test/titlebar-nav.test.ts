import {test} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = path.resolve(__dirname, "..", "..");
const html = readFileSync(path.join(root, "index.html"), "utf8");
const renderer = readFileSync(path.join(root, "src", "renderer", "index.ts"), "utf8");

test("the title bar exposes library and community navigation", () => {
  assert.match(html, /class="titlebar-nav"/);
  assert.match(html, /data-titlebar-view="play"/);
  assert.match(html, /data-titlebar-view="news"/);
  assert.match(renderer, /data-titlebar-view/);
  assert.match(renderer, /removeAttribute\("aria-current"\)/);
  assert.doesNotMatch(renderer, /nav\.setAttribute\("aria-current", nav\.dataset\.titlebarView === v \? "page" : "false"\)/);
});
