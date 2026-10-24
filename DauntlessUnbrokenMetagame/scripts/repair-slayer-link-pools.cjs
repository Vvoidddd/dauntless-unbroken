// Back up the database first; load the metagame env. Preview is the default:
// node --env-file=.env scripts/repair-slayer-link-pools.cjs <creation-cutoff-ISO> [--apply]
const {GetDb}=require('../dist/db');
const {RepairMissingLinkPools}=require('../dist/controllers/slayerlinklifecycle');
const cutoff=Date.parse(process.argv[2]);
const apply=process.argv.includes('--apply');
if(!Number.isSafeInteger(cutoff)||cutoff<=0||cutoff>Date.now())throw Error('Usage: repair-slayer-link-pools.cjs <past-creation-cutoff-ISO> [--apply]');
const db=GetDb().$client;
try{
    console.log(JSON.stringify(RepairMissingLinkPools(cutoff,apply)));
    if(apply){
        const remaining=RepairMissingLinkPools(cutoff);
        if(remaining.pools!==0)throw Error('Missing legacy prize pools remain');
        console.log(JSON.stringify({remaining:0,integrity:db.pragma('quick_check',{simple:true})}));
    }
}finally{db.close();}
