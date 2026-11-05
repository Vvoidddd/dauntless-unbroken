import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const renderer = readFileSync(path.join(path.resolve(__dirname, "..", ".."), "src", "renderer", "index.ts"), "utf8");

test("newest posts stay unread until the posts view has seen that item", () => {
  assert.match(renderer, /function newsKey\(item: NewsItem \| undefined\)/);
  assert.match(renderer, /const unread = newsKey\(item\) !== state\.newsSeenKey/);
  assert.match(renderer, /unread \? h\("span", \{\}, t\("news_new_badge"\)\) : null/);
  assert.match(renderer, /newsKey\(state\.news\[0\]\) !== state\.newsSeenKey/);
  assert.match(renderer, /state\.newsSeenKey = newsKey\(state\.news\[0\]\)/);
  assert.match(renderer, /newsChanged && previousNewsKey !== newsKey\(news\[0\]\)/);
  assert.match(renderer, /localStorage\.setItem\(storageKey, state\.newsSeenKey/);
  assert.match(renderer, /localStorage\.getItem\(storageKey\)/);
});
