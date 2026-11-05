import {test} from "node:test";
import {readFileSync} from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = path.resolve(__dirname, "..", "..");
const renderer = readFileSync(path.join(ROOT, "src", "renderer", "index.ts"), "utf8");
const theme = readFileSync(path.join(ROOT, "src", "renderer", "unbroken-theme.css"), "utf8");

test("profile settings show the friends-only audience and automatic safety policy", () => {
  assert.match(renderer, /t\("profile_audience"\)/);
  assert.match(renderer, /t\("profile_friends_only"\)/);
  assert.match(renderer, /t\("profile_automatic_check"\)/);
  assert.match(renderer, /t\("profile_safety"\)/);
  assert.match(renderer, /t\("profile_status_approved"\)/);
  assert.match(renderer, /t\("profile_status_pending"\)/);
  assert.match(renderer, /t\("profile_status_rejected"\)/);
  assert.match(renderer, /t\("profile_status_empty"\)/);
  assert.match(renderer, /t\("set_account"\)/);
  assert.match(renderer, /icon\("people", "profile-policy-icon"\)/);
});

test("profile uploads offer only formats supported by automatic moderation", () => {
  assert.match(renderer, /accept:"image\/png,image\/jpeg"/);
  assert.match(renderer, /id:"profile-picture-input"[^}]*hidden:true/);
  assert.match(renderer, /file\.type !== "image\/png"/);
  assert.match(renderer, /t\("profile_picture_choose_error"\)/);
});

test("profile moderation notices use localized keys instead of English-only copy", () => {
  assert.match(renderer, /t\("profile_picture_choose_error"\)/);
  assert.match(renderer, /t\("profile_picture_size_error"\)/);
  assert.match(renderer, /t\("profile_picture_uploading"\)/);
  assert.match(renderer, /t\("profile_picture_submitted"\)/);
  assert.match(renderer, /t\("profile_picture_rejected"\)/);
  assert.match(renderer, /t\("profile_picture_unavailable"\)/);
  assert.match(renderer, /t\("profile_picture_rate_limited"\)/);
  assert.match(renderer, /t\("profile_picture_unreachable"\)/);
  assert.match(renderer, /t\("profile_picture_failed"\)/);
  assert.match(renderer, /t\("profile_picture_read_error"\)/);
  assert.doesNotMatch(renderer, /Choose a PNG or JPEG image\./);
});

test("profile upload failures explain moderation and service limits", () => {
  assert.match(renderer, /t\("profile_picture_rejected"\)/);
  assert.match(renderer, /t\("profile_picture_unavailable"\)/);
  assert.match(renderer, /t\("profile_picture_rate_limited"\)/);
});

test("the account chip marks an approved avatar as friends-only", () => {
  assert.match(renderer, /avatar-audience/);
  assert.match(renderer, /title: t\("profile_friends_only"\)/);
});

test("the username field explains its automatic checks before submission", () => {
  assert.match(renderer, /id:"profile-username"/);
  assert.match(renderer, /for:"profile-username"/);
  assert.match(renderer, /"aria-describedby":"profile-username-hint"/);
  assert.match(renderer, /id:"profile-username-hint"/);
  assert.match(renderer, /profile-username-hint/);
  assert.match(renderer, /t\("profile_username_hint"\)/);
  assert.match(renderer, /t\("profile_username_save"\)/);
  assert.match(renderer, /checkUsername\(username\.value\.trim\(\)\)/);
  assert.match(renderer, /profile-username-state/);
});

test("the profile surface uses bundled game art without exposing implementation copy", () => {
  assert.match(theme, /hero-umbral-nayzaga\.jpg/);
  assert.match(renderer, /t\("profile_friends_only"\)/);
  assert.match(renderer, /t\("profile_automatic_check"\)/);
  assert.match(renderer, /t\("profile_choose_picture"\)/);
  assert.match(renderer, /t\("profile_upload_hint"\)/);
});

test("maintenance state disables launch and uses a compact status surface", () => {
  assert.match(renderer, /snap\.status\?\.maintenance/);
  assert.match(renderer, /const maintenanceBlocked = snap\.status\?\.maintenance === true && snap\.status\.maintenanceAllowed !== true/);
  assert.match(renderer, /primary\.disabled = b\.disabled \|\| maintenanceBlocked/);
  assert.match(renderer, /maintenance-card/);
});
