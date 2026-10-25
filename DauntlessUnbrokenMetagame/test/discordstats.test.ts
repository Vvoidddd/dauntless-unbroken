import { RemoveTestDb } from './setup';
import './authenv';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { GetDb } from '../src/db';
import { DiscordKeyStats, SummarizeBotClaims, SummarizeBotClaimHashes } from '../src/controllers/discordstats';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { unbrokenApiRouter } from '../src/routes/unbrokenapi';
import { createHash } from 'node:crypto';
after(()=>RemoveTestDb(()=>GetDb().$client.close()));
test('bot statistics distinguish claims, issuance and redemption without exposing codes or identities',()=>{
    const entries=[['unused',false],['redeemed',false],['pending',true],['revoked',false],['uncertain',true]];
    const state={version:1,users:Object.fromEntries(entries.map(([code,pending],i)=>[String(12345678901234567n+BigInt(i)),{code,pending}]))};
    const rows=['unused','redeemed','uncertain','not-a-bot-code'].map(inviteCode=>({inviteCode,usesRemaining:inviteCode==='redeemed'?0:1,infiniteUses:false}));
    assert.deepEqual(SummarizeBotClaims(state,rows),{claims:5,issued:4,unused:2,redeemed:1,pending:1,revoked:1});
    assert.throws(()=>SummarizeBotClaims({version:1,users:{bad:{code:'secret',pending:false}}},rows));
});
test('missing bot state remains unavailable while canonical linked-account count stays readable',async()=>{
    const result=await DiscordKeyStats('missing-bot-state-for-test.json');
    assert.equal(result.bot,null);assert.equal(result.linkedAccounts,0);assert.ok(result.error);
});

test('private bot snapshots join hashed invites, expire, and never require bot credentials',async()=>{
    const now=Date.now(),hash=(value:string)=>createHash('sha256').update(value).digest('hex');
    const state={version:1,at:new Date(now).toISOString(),claims:[{inviteHash:hash('secret-invite'),pending:false},{inviteHash:hash('not-issued-yet'),pending:true}]};
    const rows=[{inviteCode:'secret-invite',usesRemaining:0,infiniteUses:false}];
    assert.deepEqual(SummarizeBotClaimHashes(state,rows,now),{claims:2,issued:1,unused:0,redeemed:1,pending:1,revoked:0});
    assert.throws(()=>SummarizeBotClaimHashes(state,rows,now+30001));
    assert.throws(()=>SummarizeBotClaimHashes({...state,claims:[...state.claims,state.claims[0]]},rows,now));
    const response=await DiscordKeyStats(undefined,'http://127.0.0.1:61112',async(url,options)=>{
        assert.equal(String(url),'http://127.0.0.1:61112/bot-claims');assert.equal(options?.headers,undefined);
        return Response.json(state);
    });
    assert.equal(response.error,null);assert.equal(response.bot?.pending,1);
    for(const url of ['https://example.com','http://localhost:61112','http://127.0.0.1:61112/?key=x']){
        const failed=await DiscordKeyStats(undefined,url,async()=>{throw Error('Must not fetch');});assert.equal(failed.bot,null);assert.ok(failed.error);
    }
    const stale=await DiscordKeyStats(undefined,'http://127.0.0.1:61112',async()=>Response.json({...state,at:'2000-01-01T00:00:00Z'}));
    assert.equal(stale.bot,null);assert.ok(stale.error);
});
test('statistics join real SQLite invite column names and return only counts',async()=>{
    const dir=await mkdtemp(join(tmpdir(),'bot-stats-'));
    try {
        GetDb().$client.prepare('INSERT INTO invitecodes(invitecode,usesRemaining,infiniteUses) VALUES(?,0,0)').run('secret-invite');
        const file=join(dir,'state.json');
        await writeFile(file,JSON.stringify({version:1,users:{'12345678901234567':{code:'secret-invite',pending:false}}}));
        const result=await DiscordKeyStats(file);
        assert.equal(result.bot?.redeemed,1);assert.equal(result.bot?.revoked,0);assert.equal(result.error,null);
        assert.ok(!JSON.stringify(result).includes('secret-invite'));
        assert.ok(!JSON.stringify(result).includes('12345678901234567'));
    } finally {await rm(dir,{recursive:true,force:true});}
});
test('Discord key statistics are owner-only and refuse proxied owner requests',async()=>{
    const db=GetDb().$client;
    for(const [id,admin] of [['owner',1],['player',0]] as const) {
        db.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES(?,?,0,?)').run(`UID-${id}`,id,admin);
        db.prepare('INSERT INTO userapikeys(userId,keyHash) VALUES(?,?)').run(`UID-${id}`,createHash('sha256').update(`test-key-${id}`).digest('hex'));
    }
    const app=express();app.use('/unbroken/api',unbrokenApiRouter);
    const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
    const url=`http://127.0.0.1:${(server.address() as any).port}/unbroken/api/DiscordKeyStats`;
    try {
        assert.equal((await fetch(url)).status,401);
        assert.equal((await fetch(url,{headers:{'x-dauntless-unbroken-user-api-key':'test-key-player'}})).status,403);
        assert.equal((await fetch(url,{headers:{'x-dauntless-unbroken-user-api-key':'test-key-owner','x-forwarded-for':'203.0.113.1'}})).status,403);
        assert.equal((await fetch(url,{headers:{'x-dauntless-unbroken-user-api-key':'test-key-owner'}})).status,200);
    } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
