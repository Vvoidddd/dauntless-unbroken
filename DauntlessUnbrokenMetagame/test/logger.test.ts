import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';

test('all logger message arguments, error text and credential fields are redacted',()=>{
 const file=path.resolve(__dirname,'../src/logger.js');
 const key='UUK_'+ 'ab'.repeat(24),rotated='UUK_'+'cd'.repeat(32);
 const script=`const {logger}=require(process.argv[1]);const key=process.argv[2],rotated=process.argv[3];logger.info('note %s and %s',key,rotated);logger.info({password:'test-password',headers:{'x-dauntless-unbroken-user-api-key':key}},'structured');logger.warn({err:new Error('failed '+key)},'error');logger.warn({err:null},'no error');logger.info('player UID-example diagnostics retained');`;
 const result=spawnSync(process.execPath,['-e',script,file,key,rotated],{encoding:'utf8',env:{...process.env,NODE_ENV:'production',LOG_LEVEL:'info'}});
 assert.equal(result.status,0,result.stderr);
 assert.ok(!result.stdout.includes(key));assert.ok(!result.stdout.includes(rotated));assert.ok(!result.stdout.includes('test-password'));
 assert.match(result.stdout,/UID-example/);assert.match(result.stdout,/redacted/);
});
