import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingDirectX, gameExitDetail } from '../src/main/windows-runtime';
test('new Windows PC detects legacy DirectX dependencies independently of modern DirectX', () => {
  assert.deepEqual(missingDirectX({WINDIR:'C:\\Windows'}, p => /XINPUT1_3/i.test(p),'win32'), ['X3DAudio1_7.dll','XAPOFX1_5.dll']);
  assert.deepEqual(missingDirectX({},()=>false,'linux'),[]);
  assert.deepEqual(missingDirectX({},()=>true,'win32'),[]);
});
test('signed and unsigned missing-DLL exits provide the same actionable message', () => {
  assert.equal(gameExitDetail(-1073741515, 'win32'),gameExitDetail(3221225781, 'win32'));
  assert.match(gameExitDetail(3221225781, 'win32'),/0xC0000135.*required DLL/);
  assert.match(gameExitDetail(1, 'win32'),/0x00000001/);
  assert.match(gameExitDetail(1, 'win32'),/launcher diagnostics/);
  assert.doesNotMatch(gameExitDetail(1, 'win32'),/Archon game log/);
});
test('path-not-found exits identify the game launch path', () => {
  const detail = gameExitDetail(3, 'win32');
  assert.match(detail, /0x00000003/);
  assert.match(detail, /path|folder|directory/i);
  assert.doesNotMatch(detail, /compatibility\/runtime/i);
});
test('Linux path-not-found exits point at Proton or Wine instead of Windows runtimes', () => {
  const detail = gameExitDetail(3, 'linux');
  assert.match(detail, /0x00000003/);
  assert.match(detail, /Proton|Wine/);
  assert.match(detail, /game folder|runtime/i);
  assert.doesNotMatch(detail, /Microsoft|DirectX/);
});
test('Linux dependency exits point at Proton or Wine instead of Windows runtimes', () => {
  const missingDll = gameExitDetail(0xC0000135, 'linux');
  const badDependency = gameExitDetail(0xC000007B, 'linux');
  const unexpected = gameExitDetail(1, 'linux');
  for (const detail of [missingDll, badDependency, unexpected]) {
    assert.match(detail, /Proton|Wine/);
    assert.doesNotMatch(detail, /Microsoft|DirectX/);
  }
});
test('Linux launch failures identify the runtime that exited', () => {
  assert.match(gameExitDetail(3, 'linux', 'Proton (GE-Proton10-1)'), /Runtime used: Proton \(GE-Proton10-1\)/);
  assert.doesNotMatch(gameExitDetail(3, 'win32', 'Proton (GE-Proton10-1)'), /Runtime used/);
});
