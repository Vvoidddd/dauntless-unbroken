import Rewards from '../vendor/linked_slayer_rewards.json';
import {randomInt} from 'node:crypto';

// Native 1.4.4 link tracks use cumulative thresholds 5, 405, 1205, 2805.
export const LINK_RANK_COSTS=[5,400,800,1600];
export const LinkTrackId=(slot:number)=>`Linked_Slayer_Slot_${slot}`;
export const IsLinkTrack=(id:unknown)=>typeof id==='string'&&id.startsWith('Linked_Slayer_Slot_');
export function ParseLinkTrack(id:unknown):number|undefined{
    return typeof id==='string'&&/^Linked_Slayer_Slot_[1-3]$/.test(id)?Number(id.at(-1)):undefined;
}
export function LinkRank(points:number){let rank=0;for(const cost of LINK_RANK_COSTS){if(points<cost)break;points-=cost;rank++;}return rank;}
export function LinkTrackPaths(){return [1,2,3].map(slot=>({
    progression_id:LinkTrackId(slot),premium_gating_entitlement:'',progression_multiplier:1,
    start_date:'2019-01-01T00:00:00+00:00',end_date:'2099-01-01T00:00:00+00:00',
    requirements:[{rank_id:0,xp_required:0},...LINK_RANK_COSTS.map((cost,i)=>({rank_id:i+1,xp_required:cost}))],free_rewards:[],premium_rewards:[]
}));}
export type LinkPrize={catalog_id:string;quantity:number;received_for_level:number};

// Missing legacy pools only. Preserve the pinned native roll policy, including
// its retained original CDF after row removal and two full-range swap passes.
// Rewards JSON order matches all 69 serialized rows in the owned 1.4.4 table.
export function RollLinkPool(draw:()=>number=()=>randomInt(32768)):LinkPrize[]{
    const random=()=>Math.fround(draw()*Math.fround(1/32767));
    const pool:LinkPrize[]=[];
    for(const [itemClass,count] of Rewards.config.classes_to_draw.entries()){
        const rows=Rewards.rewards.filter(row=>row.class===itemClass);
        const total=rows.reduce((sum,row)=>sum+row.weight,0);
        if(total<=0||count>rows.length)throw Error('Invalid native prize class');
        const scale=Math.fround(1/total);let cumulative=0;
        const candidates=rows.map(row=>{
            cumulative=Math.fround(cumulative+Math.fround(row.weight*scale));
            return {row,cumulative};
        });
        let remaining=count;
        for(let attempts=0;remaining>0&&attempts<10000;attempts++){
            const value=random(),index=candidates.findIndex(candidate=>value<=candidate.cumulative);
            if(index<0)continue;
            const [{row}]=candidates.splice(index,1);
            pool.push({catalog_id:row.catalog_id,quantity:row.quantity,received_for_level:-1});
            remaining--;
        }
        if(remaining)throw Error('Native prize roll did not complete');
    }
    const shuffle=()=>{
        for(let i=0;i<pool.length;i++){
            const j=Math.min(pool.length-1,Math.trunc(Math.fround(random()*pool.length)));
            [pool[i],pool[j]]=[pool[j],pool[i]];
        }
    };
    if(pool.length<LINK_RANK_COSTS.length)throw Error('Not enough native prizes');
    shuffle();
    for(let i=0;i<LINK_RANK_COSTS.length;i++)pool[i].received_for_level=i+1;
    shuffle();
    return ReadLinkPool(pool);
}
export function ReadLinkPool(raw:unknown):LinkPrize[]{
    const max=Rewards.config.classes_to_draw.reduce((a,b)=>a+b,0);
    if(!Array.isArray(raw)||raw.length===0||raw.length>max)throw Error('Invalid prize pool size');
    const pool=raw.map(x=>{
        if(!x||!Rewards.rewards.some(r=>r.catalog_id===x.catalog_id&&r.quantity===x.quantity))throw Error('Prize is not in the native 1.4.4 table');
        if(!Number.isInteger(x.received_for_level)||x.received_for_level< -1||x.received_for_level>LINK_RANK_COSTS.length)throw Error('Invalid prize level');
        return {catalog_id:x.catalog_id,quantity:x.quantity,received_for_level:x.received_for_level} as LinkPrize;
    });
    const levels=pool.filter(x=>x.received_for_level>0).map(x=>x.received_for_level);
    if(levels.length>Rewards.config.max_rewards||new Set(levels).size!==levels.length)throw Error('Only one prize per chest is allowed');
    return pool;
}
