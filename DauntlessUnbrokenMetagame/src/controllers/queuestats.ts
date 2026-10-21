// A rough throughput estimate, not a promised slot. Silence or a thin sample means unknown.
export function EstimateQueueWait(admissions:number[],groupsAhead:number,now:number):number|null{
 const samples=[...new Set(admissions.filter(at=>Number.isFinite(at)&&at<=now&&now-at<=15*60000))].sort((a,b)=>a-b);
 if(samples.length<4||now-samples.at(-1)!>120000||samples.at(-1)!-samples[0]<30000)return null;
 const interval=(samples.at(-1)!-samples[0])/(samples.length-1);
 const seconds=Math.ceil(interval*Math.max(1,groupsAhead+1)/1000);
 return seconds>3600?null:Math.max(5,seconds);
}
