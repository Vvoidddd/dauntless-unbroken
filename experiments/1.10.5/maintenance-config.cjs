const fs=require('node:fs');

function readMaintenance(file){
 if(!fs.existsSync(file))return {MAINTENANCE_MODE:'0'};
 const raw=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!raw||raw.enabled!==true||!Array.isArray(raw.allowedAccountIds)||raw.allowedAccountIds.length===0||raw.allowedAccountIds.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(id))||new Set(raw.allowedAccountIds).size!==raw.allowedAccountIds.length)throw Error('Invalid maintenance configuration');
 return {MAINTENANCE_MODE:'1',MAINTENANCE_ALLOWED_ACCOUNT_IDS:raw.allowedAccountIds.join(',')};
}
module.exports={readMaintenance};
