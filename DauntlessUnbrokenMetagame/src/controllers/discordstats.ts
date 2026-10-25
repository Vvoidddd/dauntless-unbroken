import { readFile, stat } from 'node:fs/promises';
import { GetDb } from '../db';
import {createHash} from 'node:crypto';

export function SummarizeBotClaims(state: any, invites: {inviteCode:string, usesRemaining:number, infiniteUses:boolean}[]) {
    if (state?.version !== 1 || !state.users || typeof state.users !== 'object' || Array.isArray(state.users)) throw new Error('Invalid bot state');
    if(Object.keys(state.users).some(id=>!/^\d{17,20}$/.test(id)))throw new Error('Invalid bot claim');
    return SummarizeClaims(Object.values(state.users),invites);
}
function SummarizeClaims(claims:any[],invites:{inviteCode:string,usesRemaining:number,infiniteUses:boolean}[]){
    const codes = new Set<string>();
    const rows = new Map(invites.map(row=>[row.inviteCode,row]));
    const counts = {claims:0, issued:0, unused:0, redeemed:0, pending:0, revoked:0};
    for (const entry of claims) {
        if (typeof entry?.code !== 'string' || codes.has(entry.code) || typeof entry.pending !== 'boolean') throw new Error('Invalid bot claim');
        codes.add(entry.code); counts.claims++;
        const row = rows.get(entry.code);
        if (!row) { if (entry.pending) counts.pending++; else {counts.revoked++;counts.issued++;} continue; }
        if (row.infiniteUses || ![0,1].includes(row.usesRemaining)) throw new Error('Invalid bot invite');
        counts.issued++;
        if (row.usesRemaining === 0) counts.redeemed++; else counts.unused++;
    }
    return counts;
}

export function SummarizeBotClaimHashes(state:any,invites:{inviteCode:string,usesRemaining:number,infiniteUses:boolean}[],now=Date.now()){
    const at=Date.parse(state?.at);
    if(state?.version!==1||!Number.isFinite(at)||now-at>30000||at>now+5000||!Array.isArray(state.claims)||state.claims.length>50000)throw Error('Invalid bot snapshot');
    if(state.claims.some((entry:any)=>typeof entry?.inviteHash!=='string'||!/^[a-f0-9]{64}$/.test(entry.inviteHash)))throw Error('Invalid bot claim');
    return SummarizeClaims(state.claims.map((entry:any)=>({code:entry.inviteHash,pending:entry.pending})),
        invites.map(row=>({...row,inviteCode:createHash('sha256').update(row.inviteCode).digest('hex')})));
}

export async function DiscordKeyStats(stateFile = process.env.DISCORD_KEY_STATE_FILE,stateUrl=process.env.DISCORD_KEY_STATE_URL,fetcher=fetch) {
    const db = GetDb().$client;
    const linkedAccounts = (db.prepare('SELECT count(*) AS n FROM discordlinks').get() as {n:number}).n;
    const result = {at:new Date().toISOString(), linkedAccounts, bot:null as ReturnType<typeof SummarizeBotClaims> | null, error:null as string | null};
    if (!stateFile&&!stateUrl) return {...result,error:'Bot claim statistics are not configured.'};
    try {
        const rows = db.prepare('SELECT invitecode AS inviteCode, usesRemaining, infiniteUses FROM invitecodes').all() as {inviteCode:string,usesRemaining:number,infiniteUses:number}[];
        const invites=rows.map(row=>({...row,infiniteUses:!!row.infiniteUses}));
        if(stateFile){
            if ((await stat(stateFile)).size > 5*1024*1024) throw new Error('State too large');
            result.bot = SummarizeBotClaims(JSON.parse(await readFile(stateFile,'utf8')),invites);
        }else{
            const url=new URL(stateUrl!);
            if(url.protocol!=='http:'||url.hostname!=='127.0.0.1'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Bot monitor must use loopback tunnel');
            const response=await fetcher(new URL('/bot-claims',url),{redirect:'error',signal:AbortSignal.timeout(2500)});
            if(!response.ok||!response.body)throw Error('Bot monitor unavailable');
            const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
            try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024)throw Error('State too large');chunks.push(value);}}
            finally{await reader.cancel().catch(()=>{});}
            result.bot=SummarizeBotClaimHashes(JSON.parse(Buffer.concat(chunks).toString('utf8')),invites);
        }
    } catch { result.error = 'Bot claim statistics are unavailable; no zero counts have been assumed.'; }
    return result;
}
