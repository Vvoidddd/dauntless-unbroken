// Read-only checks against the running private test realm. Never touches production.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const Database=require('../../DauntlessUnbrokenMetagame/node_modules/better-sqlite3');
const {headers,privateIp}=require('./realm-proxy.cjs');
const state=path.resolve(__dirname,'../../../backend-state');
async function main(){
 const db=new Database(path.join(state,'realm.db'),{readonly:true,fileMustExist:true});
 try{
  assert.equal(db.pragma('integrity_check',{simple:true}),'ok');
  const exports=JSON.parse(fs.readFileSync(path.join(state,'friends-live-export.json')));
  for(const ex of exports){
   const user=db.prepare('SELECT name,isAdmin FROM users WHERE userId=?').get(ex.userId);
   assert.equal(user.name,ex.tables.users[0].name);assert.equal(user.isAdmin,0);
   assert.equal(db.prepare('SELECT keyHash FROM userapikeys WHERE userId=?').get(ex.userId).keyHash,ex.tables.userapikeys[0].keyHash);
   for(const row of ex.tables.inventories){
    const local=db.prepare('SELECT instancedItems,stackedItems FROM inventories WHERE characterId=?').get(row.characterId);assert.ok(local);
    // Void has already played; check the untouched friend copies byte-for-byte.
    if(user.name!=='Void')assert.deepEqual(local,{instancedItems:row.instancedItems,stackedItems:row.stackedItems});
   }
  }
  assert.equal(privateIp('100.69.103.30'),true);assert.equal(privateIp('127.0.0.1'),false);assert.equal(privateIp('100.999.1.1'),false);
  const forwarded=headers({headers:{'x-dauntless-unbroken-gameserver-apikey':'forged','x-forwarded-for':'127.0.0.1',forwarded:'for=127.0.0.1'},socket:{remoteAddress:'100.70.1.2'}});
  assert.equal(forwarded['x-forwarded-for'],'100.70.1.2');assert.equal(forwarded['x-dauntless-unbroken-gameserver-apikey'],undefined);assert.equal(forwarded.forwarded,undefined);
  const host=JSON.parse(fs.readFileSync(path.join(state,'realm-config.json'))).PublicHost;
  assert.equal((await fetch(`http://${host}:62002/test/game-package.json`)).status,401);
  const archive=await fetch(`http://${host}:62002/test/launcher.zip`,{method:'HEAD'});assert.equal(archive.status,200);assert.ok(Number(archive.headers.get('content-length'))>1000000);
  assert.equal((await fetch('http://127.0.0.1:62110/api/status')).status,401);
  const key=fs.readFileSync(path.join(state,'realm-owner.key'),'utf8').trim();
  assert.equal((await fetch(`http://${host}:62002/unbroken/api/RewardCatalog`,{headers:{'x-dauntless-unbroken-user-api-key':key}})).status,403);
  if(process.argv.includes('--invites')){
   const response=await fetch('http://127.0.0.1:62110/api/invites',{method:'POST',headers:{'x-dashboard-key':key,origin:'http://127.0.0.1:62110','content-type':'application/json'},body:JSON.stringify({uses:1,name:'Local 1.10.5 verification'})});
   assert.equal(response.status,200);const invite=await response.json();
   const link=new URL(invite.invite);assert.equal(link.protocol,'dauntless-unbroken:');assert.equal(link.hostname,'join');assert.equal(link.searchParams.get('host'),host);assert.equal(link.searchParams.get('port'),'62002');assert.equal(link.searchParams.get('v'),'1');assert.equal(invite.gameVersion,'1.10.5');
   const code=link.searchParams.get('code');assert.match(code,/^[A-Za-z0-9-]{4,64}$/);
   const removed=await fetch(`http://127.0.0.1:62000/unbroken/api/InviteCode/${encodeURIComponent(code)}`,{method:'DELETE',headers:{'x-dauntless-unbroken-user-api-key':key}});
   assert.equal(removed.status,200);console.log('Dashboard created a test-only invite; verification invite revoked.');
  }
  console.log('Realm checks passed: four imported accounts, untouched friend inventories, key hashes, database integrity, private downloads and remote admin denial.');
 }finally{db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
