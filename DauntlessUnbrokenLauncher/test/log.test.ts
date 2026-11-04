import {test} from 'node:test';
import assert from 'node:assert/strict';
import {captureMainRejection,captureNodeWarning,describeError,setSink,log} from '../src/main/log';

test('process error capture records unhandled rejections and warnings through the redacted logger',()=>{
 const lines:string[]=[];
 setSink(line=>lines.push(line));
 try{
  captureMainRejection(new Error('rejection UUK_'+'a'.repeat(48)));
  captureNodeWarning(new Error('warning UUK_'+'b'.repeat(48)));
  assert.match(lines[0],/ERROR unhandled main rejection: Error: rejection/);
  assert.match(lines[1],/WARN node warning: Error: warning/);
  assert.ok(!lines.some(line=>line.includes('a'.repeat(48))));
 }finally{setSink(line=>console.log(line));}
});

test('describeError keeps useful error names and messages without exposing keys',()=>{
 const text=describeError(new Error('bad UUK_'+'c'.repeat(48)));
 assert.equal(text,'Error: bad UUK_<hidden>');
});

test('ordinary log lines hide sensitive URL query parameters while preserving useful context',()=>{
 const lines:string[]=[];
 setSink(line=>lines.push(line));
 try{
  log.warn('download failed https://example.invalid/content?key=private-key&token=private-token&file=manifest');
  assert.ok(!lines[0].includes('private-key'));
  assert.ok(!lines[0].includes('private-token'));
  assert.match(lines[0],/download failed https:\/\/example\.invalid\/content/);
 }finally{setSink(line=>console.log(line));}
});
