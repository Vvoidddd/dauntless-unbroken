const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {readMaintenance}=require('./maintenance-config.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'maintenance-config-')),file=path.join(dir,'maintenance.json');
try{
 assert.deepEqual(readMaintenance(file),{MAINTENANCE_MODE:'0'});
 for(const bad of [{},{enabled:false,allowedAccountIds:['UID-a']},{enabled:true,allowedAccountIds:[]},{enabled:true,allowedAccountIds:['UID-a','UID-a']},{enabled:true,allowedAccountIds:['UID-a','bad,id']}] ){
  fs.writeFileSync(file,JSON.stringify(bad));assert.throws(()=>readMaintenance(file),/Invalid/);
 }
 fs.writeFileSync(file,JSON.stringify({enabled:true,allowedAccountIds:['UID-a','UID-b']}));
 assert.deepEqual(readMaintenance(file),{MAINTENANCE_MODE:'1',MAINTENANCE_ALLOWED_ACCOUNT_IDS:'UID-a,UID-b'});
 fs.writeFileSync(file,'{');assert.throws(()=>readMaintenance(file));
 console.log('Maintenance configuration defaults, valid IDs and invalid settings passed.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
