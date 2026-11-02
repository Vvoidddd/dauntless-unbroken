// Uses a disposable support-test account, never sends messages to players.
import {RemoveTestDb} from '../../DauntlessUnbrokenMetagame/test/setup';
import '../../DauntlessUnbrokenMetagame/test/authenv';
import {Login} from '../../DauntlessUnbrokenMetagame/test/chatwire';
import {GetDb} from '../../DauntlessUnbrokenMetagame/src/db';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),transport=require('./launcher/transport.cjs');
async function main(){
 const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const {key,uid}=JSON.parse(fs.readFileSync(process.argv[3],'utf8'));
 const auth=await transport.request(config,'/account/api/oauth/token',{exchange_code:key});
 assert.equal(auth.account_id,uid);
 const bridge=transport.createBridge(config,true);
 await new Promise<void>((resolve,reject)=>{bridge.once('error',reject);bridge.listen(0,'127.0.0.1',resolve);});
 try{
  const client=await Login(bridge.address().port,uid,{OpenTo:'localhost',Token:auth.access_token});
  try{await client.Barrier();console.log('Hosted TLS chat: game-shaped WebSocket upgrade, SASL authentication, resource bind and ping passed.');}
  finally{client.Close();}
 }finally{bridge.stop();RemoveTestDb(()=>GetDb().$client.close());}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
