import './setup';
import './deployenv';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {Startup,GetRamsgateConnectionDetails,Gameservers,ResetGameserversForTests,UseProcessFunctionsForTests,CleanupServer} from '../src/controllers/gameservers';
import {HandleMatchmakingRequest} from '../src/controllers/matchmaker';
const children=new Map<number,EventEmitter>();
let pid=50000;
UseProcessFunctionsForTests({Spawn:(_command,args)=>{
    const child=new EventEmitter() as any;
    child.pid=++pid;child.unref=()=>{};
    children.set(child.pid,child);
    assert.ok(args.includes('/Game/Maps/ramsgate/ramsgate_01_persistent?MaxPlayers=20'));
    return child;
},IsAlive:id=>children.has(id),IsPortBound:async()=>false});
after(()=>{UseProcessFunctionsForTests({});ResetGameserversForTests();process.env.RAMSGATE_POOL='0';});
test('fresh boot stays empty; the 21st traveller starts another city and empty instances release ports without restarting',async()=>{
    process.env.RAMSGATE_POOL='1';ResetGameserversForTests();await Startup();
    assert.equal(Gameservers.length,0);
    const results=await Promise.all(Array.from({length:21},()=>GetRamsgateConnectionDetails()));
    assert.equal(Gameservers.length,2);
    assert.equal(results.filter(r=>r.port===8777).length,20);
    const extra=Gameservers.find(s=>s.port!==8777)!;
    assert.equal(extra.isRamsgate,true);
    assert.notEqual(extra.port,8776);
    const exited = children.get(extra.processId)!;
    children.delete(extra.processId);exited.emit('exit',0,null);
    await CleanupServer(extra);
    assert.equal(Gameservers.length,1);
    const next=await GetRamsgateConnectionDetails();
    assert.equal(next.port,extra.port,'the released shared port is available for a new city');
    for(const city of [...Gameservers]) {children.delete(city.processId);await CleanupServer(city);}
    assert.equal(Gameservers.length,0,'no city is restarted when empty');
});

test('a full local Ramsgate pool tries the second EU host before returning capacity',async()=>{
    process.env.RAMSGATE_POOL='1';process.env.RAMSGATE_CITY_CAPS='1';
    process.env.OVERFLOW_DEPLOYSERVER_URL='http://127.0.0.1:9';
    ResetGameserversForTests();
    const original=globalThis.fetch;const calls:any[]=[];
    globalThis.fetch=(async(_url:any,init:any)=>{
        if(!init?.body)return new Response(JSON.stringify({servers:[],capacity:{running:0,pending:0,limit:42}}),{status:200});
        calls.push(JSON.parse(init.body));
        return new Response(JSON.stringify({host:'127.0.0.2',port:8730,sessionId:'remote-city'}),{status:200});
    }) as typeof fetch;
    try {
        await GetRamsgateConnectionDetails();
        const result=await HandleMatchmakingRequest('CITY','','',['UID-queued']);
        assert.equal(result.host,'127.0.0.2');assert.equal(calls.length,1);
        assert.deepEqual(calls[0].ExpectedPlayers,['UID-queued']);
    } finally {globalThis.fetch=original;delete process.env.RAMSGATE_CITY_CAPS;delete process.env.OVERFLOW_DEPLOYSERVER_URL;ResetGameserversForTests();}
});
