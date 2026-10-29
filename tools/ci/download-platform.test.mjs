import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../docs/assets/download-platform.js',import.meta.url),'utf8');
const {downloadPlatform}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
test('download page selects native Windows or Linux and excludes unsupported mobile/macOS',()=>{
 for(const [platform,ua,expected] of [['Windows','Windows NT 10.0','windows'],['Win32','','windows'],['Linux','X11; Linux x86_64','linux'],['','X11; Ubuntu; Linux x86_64','linux'],['Linux','Android','unsupported'],['MacIntel','Mac OS X','unsupported'],['iPad','Mac OS X','unsupported']])assert.equal(downloadPlatform(platform,ua),expected);
});
