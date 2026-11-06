import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsLauncherUpdate} from '../src/main/launcher-policy';
test('stable launcher floor compares numeric components and rejects prerelease parity',()=>{
  assert.equal(needsLauncherUpdate('1.0.44','1.0.45'),true);
  assert.equal(needsLauncherUpdate('1.0.45','1.0.45'),false);
  assert.equal(needsLauncherUpdate('1.0.100','1.0.45'),false);
  assert.equal(needsLauncherUpdate('1.0.45-beta.1','1.0.45'),true);
  assert.equal(needsLauncherUpdate('1.0.1',null),false);
  assert.equal(needsLauncherUpdate('1.0.1','invalid'),false);
});
