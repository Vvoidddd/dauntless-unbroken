import {RemoveTestDb} from './setup';
import './authenv';
import {WithEnv} from './appenv';
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {GetDb} from '../src/db';
import {GetUserIDForAPIKey,HashUserAPIKey,ValidateMetagameJWTAndGetPayload} from '../src/controllers/auth';
import {userapikeys} from '../src/db/schema';
import {Call,StartApp,StopApp} from './appclient';
import {MakePlayer} from './helpers';

before(StartApp);
after(async()=>{await StopApp();RemoveTestDb(()=>GetDb().$client.close());});

test('invalid API key values cannot reach the hasher',async()=>{
 for(const key of [undefined,null,0,true,[],{},'']){
  assert.equal(await GetUserIDForAPIKey(key),undefined);
 }
});

test('malformed EOS token requests terminate with the existing bad-credentials response',async()=>{
 const replies=[await Call('POST','/account/api/oauth/token'),await Call('POST','/account/api/oauth/token',{body:{}})];
 for(const code of [null,0,true,[],{},'']){
  replies.push(await Call('POST','/account/api/oauth/token',{body:{exchange_code:code}}));
 }
 replies.push(await Call('POST','/account/api/oauth/token',{body:{grant_type:'refresh_token',refresh_token:'not-a-session'}}));
 for(const reply of replies)assert.deepEqual([reply.status,reply.text],[400,'']);
});

test('valid EOS API-key login still supplies a usable player token',async()=>{
 const player=await MakePlayer();
 const key='UUK_'+crypto.randomUUID();
 GetDb().insert(userapikeys).values({userId:player.UserId,keyHash:HashUserAPIKey(key)}).run();
 const bad=await Call('POST','/account/api/oauth/token',{body:{exchange_code:'unknown-key'}});
 assert.deepEqual([bad.status,bad.text],[400,'']);
 const good=await Call('POST','/account/api/oauth/token',{body:{grant_type:'exchange_code',exchange_code:key}});
 assert.equal(good.status,200);
 assert.equal(good.json.account_id,player.UserId);
 assert.equal(ValidateMetagameJWTAndGetPayload(good.json.access_token).userId,player.UserId);
 const login=await Call('POST','/login',{headers:{authorization:'bearer '+good.json.access_token},body:{email:player.UserId}});
 assert.equal(login.status,200);
 assert.equal(login.json.state,'OPEN');
});

test('unavailable EOS authentication configurations terminate without exposing configuration',async()=>{
 for(const mode of [undefined,'invalid','NONE']){
  await WithEnv({AUTH_MODE:mode,NODE_ENV:'production'},async()=>{
   const reply=await Call('POST','/account/api/oauth/token',{body:{exchange_code:'valid-shaped-code'}});
   assert.deepEqual([reply.status,reply.text],[503,'']);
  });
 }
});

test('development NONE authentication retains its existing valid login contract',async()=>{
 const player=await MakePlayer();
 await WithEnv({AUTH_MODE:'NONE',NODE_ENV:'development'},async()=>{
  const reply=await Call('POST','/account/api/oauth/token',{body:{exchange_code:player.UserId}});
  assert.equal(reply.status,200);
  assert.equal(reply.json.account_id,player.UserId);
 });
});
