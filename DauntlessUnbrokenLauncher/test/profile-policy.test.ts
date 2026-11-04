import {test} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(__dirname, "..", "..");
const renderer = readFileSync(path.join(ROOT, "src", "renderer", "index.ts"), "utf8");
const theme = readFileSync(path.join(ROOT, "src", "renderer", "unbroken-theme.css"), "utf8");

test("profile settings show the friends-only audience and automatic safety policy", () => {
  assert.match(renderer, /Audience/);
  assert.match(renderer, /Friends only/);
  assert.match(renderer, /Automatic check/);
  assert.match(renderer, /icon\("people", "profile-policy-icon"\)/);
});

test("profile uploads offer only formats supported by automatic moderation", () => {
  assert.match(renderer, /accept:"image\/png,image\/jpeg"/);
  assert.match(renderer, /file\.type !== "image\/png"/);
  assert.match(renderer, /Choose a PNG or JPEG image/);
});

test("the account chip marks an approved avatar as friends-only", () => {
  assert.match(renderer, /avatar-audience/);
  assert.match(renderer, /Visible to accepted friends/);
});

test("the username field explains its automatic checks before submission", () => {
  assert.match(renderer, /profile-username-hint/);
  assert.match(renderer, /3–16 letters, numbers, or underscores/);
  assert.match(renderer, /automatic name checks/);
  assert.match(renderer, /checkUsername\(username\.value\.trim\(\)\)/);
  assert.match(renderer, /profile-username-state/);
});

test("the profile surface uses bundled game art without exposing implementation copy", () => {
  assert.match(theme, /hero-umbral-nayzaga\.jpg/);
  assert.match(renderer, /Friends only/);
  assert.match(renderer, /Automatic check/);
});

test("maintenance state disables launch and uses a compact status surface", () => {
  assert.match(renderer, /snap\.status\?\.maintenance/);
  assert.match(renderer, /primary\.disabled = b\.disabled \|\| snap\.status\?\.maintenance === true/);
  assert.match(renderer, /maintenance-card/);
});
