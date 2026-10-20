import {RemoveTestDb} from './setup';
import {test,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {GetDb} from '../src/db';
import {RecordPlaytimeBeat,FlushPlaytime,GetPlaytimeSeconds,ResetPlaytimeTracking,MAX_GAP_MS} from '../src/controllers/playtime';

after(()=>{ResetPlaytimeTracking();RemoveTestDb(()=>GetDb().$client.close());});
beforeEach(()=>ResetPlaytimeTracking());
function user(id:string){GetDb().$client.prepare('INSERT INTO users(userId,name,notes,isAdmin) VALUES (?,?,0,0)').run(id,id);return id;}

test('heartbeats add the time between them and are saved',()=>{
    const id=user('playtime-basic');
    let now=1_000_000;
    RecordPlaytimeBeat(id,now);
    for(let i=0;i<9;i++){now+=20_000;RecordPlaytimeBeat(id,now);}
    assert.equal(GetPlaytimeSeconds(id),180);
    FlushPlaytime(now);
    const row=GetDb().$client.prepare('SELECT seconds FROM account_playtime WHERE account_id=?').get(id) as {seconds:number};
    assert.equal(row.seconds,180);
    assert.equal(GetPlaytimeSeconds(id),180);
    now+=20_000;RecordPlaytimeBeat(id,now);FlushPlaytime(now);
    assert.equal(GetPlaytimeSeconds(id),200);
});

test('a long gap adds nothing and the next session counts again',()=>{
    const id=user('playtime-gap');
    let now=5_000_000;
    RecordPlaytimeBeat(id,now);
    now+=MAX_GAP_MS+1;RecordPlaytimeBeat(id,now);
    assert.equal(GetPlaytimeSeconds(id),0);
    now+=20_000;RecordPlaytimeBeat(id,now);
    assert.equal(GetPlaytimeSeconds(id),20);
});

test('two clients on one account count once',()=>{
    const id=user('playtime-double');
    let now=9_000_000;
    RecordPlaytimeBeat(id,now);
    for(let i=0;i<3;i++){now+=20_000;RecordPlaytimeBeat(id,now);RecordPlaytimeBeat(id,now+1_000);}
    assert.equal(GetPlaytimeSeconds(id),60);
});

test('an unknown account is never written',()=>{
    let now=12_000_000;
    RecordPlaytimeBeat('nobody',now);now+=20_000;RecordPlaytimeBeat('nobody',now);
    FlushPlaytime(now);
    assert.equal(GetDb().$client.prepare('SELECT 1 FROM account_playtime WHERE account_id=?').get('nobody'),undefined);
});

test('a rolled-back flush keeps every pending account for the retry',()=>{
    const a=user('playtime-retry-a'),b=user('playtime-retry-b'),sql=GetDb().$client;
    for(const id of [a,b]){RecordPlaytimeBeat(id,20_000_000);RecordPlaytimeBeat(id,20_020_000);}
    sql.exec(`CREATE TRIGGER fail_playtime BEFORE INSERT ON account_playtime WHEN NEW.account_id='${b}' BEGIN SELECT RAISE(ABORT,'test rollback'); END`);
    try{FlushPlaytime(20_020_000);}finally{sql.exec('DROP TRIGGER fail_playtime');}
    assert.equal((sql.prepare('SELECT count(*) n FROM account_playtime WHERE account_id IN (?,?)').get(a,b) as {n:number}).n,0);
    assert.equal(GetPlaytimeSeconds(a),20);assert.equal(GetPlaytimeSeconds(b),20);
    FlushPlaytime(20_020_000);
    assert.equal(GetPlaytimeSeconds(a),20);assert.equal(GetPlaytimeSeconds(b),20);
});
