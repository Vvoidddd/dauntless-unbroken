import {RemoveTestDb} from './setup';
import './authenv';
import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {GetDb} from '../src/db';
import {users,userapikeys,gameserverapikeys} from '../src/db/schema';
import {HashUserAPIKey,SignMetagameJWTForUid,ValidateMetagameJWTAndGetPayload} from '../src/controllers/auth';
import {app} from '../src/app';
import {ChatServer} from '../src/realtime/chat';
import {WireClient,Base64Plain} from './chatwire';
import {PollParty,InviteToParty,AcceptPartyInvite} from '../src/controllers/party';
import {HandlePlayerMatchmaking} from '../src/controllers/matchmaking';

after(()=>RemoveTestDb(()=>GetDb().$client.close()));

test('maintenance restricts existing and fresh player credentials without blocking game-server keys',async()=>{
  const allowed='UID-maint-allowed', denied='UID-maint-denied';
  const allowedKey='UUK_'+'a'.repeat(48),deniedKey='UUK_'+'b'.repeat(48),serverKey='server-test-key';
  const db=GetDb();
  db.insert(users).values([{userId:allowed,name:'Allowed',notes:0},{userId:denied,name:'Denied',notes:0}]).run();
  db.insert(userapikeys).values([{userId:allowed,keyHash:HashUserAPIKey(allowedKey)},{userId:denied,keyHash:HashUserAPIKey(deniedKey)}]).run();
  db.insert(gameserverapikeys).values({keyHash:createHash('sha256').update(serverKey).digest('hex')}).run();
  const allowedToken=SignMetagameJWTForUid(allowed), oldToken=SignMetagameJWTForUid(denied);
  const party=await PollParty(allowed) as any;await PollParty(denied);
  assert.equal(InviteToParty(allowed,denied,party.partyId).Status,200);
  assert.equal((await AcceptPartyInvite(denied,party.partyId)).Status,200);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const chat=new ChatServer(); await chat.listen(0);
  const base=`http://127.0.0.1:${(server.address() as any).port}`;
  const api=async(path:string,headers:Record<string,string>,body?:unknown)=>fetch(base+path,{method:body?'POST':'GET',headers:{...headers,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  try{
    assert.equal((await api('/unbroken/api/GetUserInfo',{'x-dauntless-unbroken-user-api-key':deniedKey})).status,200);
    process.env.MAINTENANCE_MODE='1';process.env.MAINTENANCE_ALLOWED_ACCOUNT_IDS=allowed;
    assert.equal((await api('/unbroken/api/GetUserInfo',{'x-dauntless-unbroken-user-api-key':allowedKey})).status,200);
    assert.equal((await api('/unbroken/api/GetUserInfo',{'x-dauntless-unbroken-user-api-key':deniedKey})).status,503);
    assert.equal((await api('/account/api/oauth/token',{}, {exchange_code:deniedKey})).status,503);
    assert.equal((await api('/account/api/oauth/token',{}, {exchange_code:allowedKey})).status,200);
    assert.equal((await api('/accountinfo',{authorization:'Bearer '+oldToken})).status,503);
    assert.equal((await api('/account/api/oauth/verify',{authorization:'Bearer '+oldToken})).status,503);
    assert.equal((await api('/account/api/oauth/verify',{})).status,503);
    assert.equal((await api('/account/api/oauth/verify',{authorization:'Bearer bad'})).status,503);
    assert.equal((await api('/account/api/oauth/verify',{authorization:'Bearer '+allowedToken})).status,200);
    assert.equal((await api('/candidate/player/alive',{'x-dauntless-unbroken-gameserver-apikey':serverKey},{playerIds:[]})).status,200);
    assert.equal(await HandlePlayerMatchmaking('ISLAND','','CR19_PlayerHunt_FTUE_Pursuit_Beta_LeRawr',allowed),false);
    assert.throws(()=>ValidateMetagameJWTAndGetPayload(oldToken),/maintenance/);
    assert.ok(ValidateMetagameJWTAndGetPayload(allowedToken));
    const socket=await WireClient.Connect(chat.port);
    try{
      socket.Send('<open xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>');
      await socket.Expect();await socket.Expect();
      socket.Send(`<auth xmlns="urn:ietf:params:xml:ns:xmpp-sasl" mechanism="PLAIN">${Base64Plain('',denied,oldToken)}</auth>`);
      assert.match(await socket.Expect(),/failure|not-authorized/);
    }finally{socket.Socket.terminate();}
    process.env.MAINTENANCE_ALLOWED_ACCOUNT_IDS='';
    assert.equal((await api('/unbroken/api/GetUserInfo',{'x-dauntless-unbroken-user-api-key':allowedKey})).status,503);
    process.env.MAINTENANCE_MODE='invalid';
    assert.equal((await api('/unbroken/api/GetUserInfo',{'x-dauntless-unbroken-user-api-key':allowedKey})).status,503);
    delete process.env.MAINTENANCE_MODE;delete process.env.MAINTENANCE_ALLOWED_ACCOUNT_IDS;
    assert.equal((await api('/unbroken/api/GetUserInfo',{'x-dauntless-unbroken-user-api-key':deniedKey})).status,200);
  }finally{
    delete process.env.MAINTENANCE_MODE;delete process.env.MAINTENANCE_ALLOWED_ACCOUNT_IDS;
    await chat.close();await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));
  }
});
