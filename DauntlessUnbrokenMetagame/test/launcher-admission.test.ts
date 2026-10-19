import {RemoveTestDb} from './setup';
import './matchmakingenv';
import './authenv';
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import {RegisterUser} from '../src/controllers/unbrokenapi';
import {unbrokenApiRouter} from '../src/routes/unbrokenapi';
import {GetDb} from '../src/db';
import {SetPartyClockForTests} from '../src/controllers/party';
import {JoinLauncherAdmission, PollLauncherAdmission, CancelLauncherAdmission, LauncherQueueStatus, HandlePlayerMatchmaking, CheckAndUpdateQueueStatus, ResetMatchmakingForTests} from '../src/controllers/matchmaking';
after(()=>RemoveTestDb(()=>GetDb().$client.close()));

test('admission API requires a valid account and ignores attempts to select another account or priority',async()=>{
    ResetMatchmakingForTests();
    const a=await RegisterUser('Admission_A'),b=await RegisterUser('Admission_B');
    const app=express();app.use(express.json());app.use('/unbroken/api',unbrokenApiRouter);
    const server=http.createServer(app);
    await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
    const base=`http://127.0.0.1:${(server.address() as any).port}/unbroken/api/Admission`;
    const original=globalThis.fetch;
    globalThis.fetch=(async()=>new Response(JSON.stringify({error:'capacity_unavailable',reason:'hunts'}),{status:503})) as typeof fetch;
    const call=(method:string,key?:string,body?:unknown)=>original(base,{method,headers:{...(key?{'x-dauntless-unbroken-user-api-key':key}:{}),'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    try {
        assert.equal((await call('POST')).status,401);
        assert.equal((await call('GET','invalid')).status,401);
        assert.equal((await (await call('POST',a,{userId:'victim',position:1})).json()).position,1);
        assert.equal((await (await call('GET',b)).json()).state,'idle');
        assert.equal((await (await call('POST',b,{userId:'victim',queuedAt:0,position:1})).json()).position,2);
        assert.equal((await call('DELETE',b,{userId:'Admission_A'})).status,204);
        assert.equal((await (await call('GET',a)).json()).state,'waiting');
        assert.equal((await (await call('GET',b)).json()).state,'idle');
    } finally {globalThis.fetch=original;server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));ResetMatchmakingForTests();}
});

test('launcher Ramsgate admission keeps FIFO for twenty minutes and the game reuses its seat',async()=>{
    ResetMatchmakingForTests();
    let now=100000, full=true;
    const original=globalThis.fetch, calls:any[]=[];
    SetPartyClockForTests(()=>now);
    globalThis.fetch=(async(_url:any,init:any)=>{
        calls.push(JSON.parse(init.body));
        return full ? new Response(JSON.stringify({error:'capacity_unavailable',reason:'hunts'}),{status:503})
            : new Response(JSON.stringify({host:'127.0.0.1',port:39001}),{status:200});
    }) as typeof fetch;
    try {
        assert.equal((await JoinLauncherAdmission('UID-old')).state,'waiting');
        now++;
        assert.equal((await JoinLauncherAdmission('UID-new')).state,'waiting');
        assert.deepEqual(LauncherQueueStatus('UID-new'),{state:'waiting',kind:'ramsgate',full:true,position:2,total:2,groupSize:1});
        // A repeated click cannot create extra seats or move ahead.
        await JoinLauncherAdmission('UID-new');
        assert.equal(LauncherQueueStatus('UID-new').position,2);
        for(let i=0;i<120;i++) {now+=10000;await PollLauncherAdmission('UID-old');await PollLauncherAdmission('UID-new');}
        full=false;now+=10000;
        const before=calls.length;
        await PollLauncherAdmission('UID-new');
        assert.equal(calls.length,before,'newer poll must not steal free capacity');
        assert.equal((await PollLauncherAdmission('UID-old')).state,'ready');
        const allocated=calls.length;
        await HandlePlayerMatchmaking('CITY','','ShatteredIsles_ReturnToRamsgate','UID-old');
        assert.equal((await CheckAndUpdateQueueStatus('UID-old'))?.Ready,true);
        assert.equal(calls.length,allocated,'game must reuse launcher allocation');
        now+=10000;
        assert.equal((await PollLauncherAdmission('UID-new')).state,'ready');
    } finally {globalThis.fetch=original;SetPartyClockForTests();ResetMatchmakingForTests();}
});

test('cancelling launcher admission releases ordering and never cancels a subsequent hunt',async()=>{
    ResetMatchmakingForTests();let now=100000;SetPartyClockForTests(()=>now);
    const original=globalThis.fetch;
    globalThis.fetch=(async()=>new Response(JSON.stringify({error:'capacity_unavailable',reason:'cpu'}),{status:503})) as typeof fetch;
    try {
        await JoinLauncherAdmission('UID-a');now++;await JoinLauncherAdmission('UID-b');
        CancelLauncherAdmission('UID-a');
        assert.equal(LauncherQueueStatus('UID-b').position,1);
        await HandlePlayerMatchmaking('ISLAND','','Hunt_Test_A','UID-a',true);
        await new Promise(resolve=>setImmediate(resolve));
        CancelLauncherAdmission('UID-a');
        assert.equal(LauncherQueueStatus('UID-a').kind,'hunt');
        // The launcher observes hunts but cannot renew an abandoned game's lease.
        now+=70000;
        assert.notEqual((await PollLauncherAdmission('UID-a')).state,'waiting');
    } finally {globalThis.fetch=original;SetPartyClockForTests();ResetMatchmakingForTests();}
});
