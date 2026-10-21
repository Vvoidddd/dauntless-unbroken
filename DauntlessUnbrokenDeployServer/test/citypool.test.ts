import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CityPool, City} from '../src/controllers/citypool';
import {CapacityUnavailable} from '../src/controllers/capacity';

function fixture(caps?:number[]) {
    let now=100000;
    const cities:City[]=[];
    const pool=new CityPool(()=>cities, async()=>{
        const city={id:String(cities.length+1),players:undefined,startedAt:now};
        cities.push(city); return city;
    }, id=>cities.find(c=>c.id===id)!,()=>now,()=>caps);
    return {pool,cities,advance:(ms:number)=>{now+=ms;}};
}

test('oldest-city reserved seats admit priority parties without overfilling or shrinking later cities',async()=>{
    process.env.PRIORITY_RESERVED_CITY_SEATS='5';
    try {
        const {pool,cities}=fixture([20,20]);
        for(let i=0;i<35;i++)await pool.allocate();
        assert.equal(cities.length,2);
        await assert.rejects(pool.allocate(),CapacityUnavailable);
        assert.equal((await pool.allocate(4,true)).id,'1');
        assert.equal((await pool.allocate(1,true)).id,'1');
        await assert.rejects(pool.allocate(1,true),CapacityUnavailable);
    }finally{delete process.env.PRIORITY_RESERVED_CITY_SEATS;}
});
test('21 concurrent travellers share one cold city until its 20th seat, then start another',async()=>{
    const {pool,cities}=fixture();
    const allocations=await Promise.all(Array.from({length:21},()=>pool.allocate()));
    assert.equal(cities.length,2);
    assert.equal(allocations.filter(c=>c.id==='1').length,20);
    assert.equal(allocations[20].id,'2');
});
test('whole parties reserve seats together and arrivals consume travel reservations',async()=>{
    const {pool,cities}=fixture();
    for(let i=0;i<5;i++)await pool.allocate(4);
    cities[0].players=20;
    assert.equal((await pool.allocate(1)).id,'2');
    cities[0].players=16;
    assert.equal((await pool.allocate(4)).id,'1');
    assert.equal((await pool.allocate(1)).id,'2');
});
test('missing telemetry after loading grace never means an existing city has free seats',async()=>{
    const {pool,cities,advance}=fixture();await pool.allocate();advance(180001);
    assert.equal((await pool.allocate()).id,'2');
    assert.equal(cities.length,2);
});
test('empty previously occupied cities are not reused during retirement',async()=>{
    const {pool,cities}=fixture();await pool.allocate();cities[0].players=1;
    await pool.allocate();cities[0].players=0;
    assert.equal((await pool.allocate()).id,'2');
});
test('failed cold starts release the allocator and oversized parties are refused',async()=>{
    let calls=0;
    const pool=new CityPool(()=>[],async()=>{if(++calls===1)throw new Error('failed');return {id:'ok'};},()=>({id:'ok'}));
    await assert.rejects(pool.allocate(),/failed/);
    assert.equal((await pool.allocate()).id,'ok');
    await assert.rejects(pool.allocate(21),CapacityUnavailable);
});

test('capped cities fill in start order: 10, then 10, then 8, then no more',async()=>{
    const {pool,cities}=fixture([10,10,8]);
    const ids:string[]=[];
    for(let i=0;i<28;i++)ids.push((await pool.allocate()).id);
    assert.equal(cities.length,3);
    assert.equal(ids.filter(id=>id==='1').length,10);
    assert.equal(ids.filter(id=>id==='2').length,10);
    assert.equal(ids.filter(id=>id==='3').length,8);
    assert.deepEqual(ids.slice(0,12),[...Array(10).fill('1'),'2','2']);
    await assert.rejects(pool.allocate(),CapacityUnavailable);
    assert.equal(cities.length,3);
});
test('a party stays together and spills to the next capped city only when it does not fit',async()=>{
    const {pool}=fixture([10,10,8]);
    for(let i=0;i<2;i++)await pool.allocate(4);
    assert.equal((await pool.allocate(4)).id,'2');
    assert.equal((await pool.allocate(2)).id,'1');
});
test('a freed seat in an earlier city is used before a later one',async()=>{
    const {pool,cities}=fixture([10,10,8]);
    for(let i=0;i<12;i++)await pool.allocate();
    cities[0].players=10; cities[1].players=2;
    assert.equal((await pool.allocate()).id,'2');
    cities[0].players=9;
    assert.equal((await pool.allocate()).id,'1');
});
test('without caps the default is unchanged',async()=>{
    const {pool,cities}=fixture();
    await Promise.all(Array.from({length:21},()=>pool.allocate()));
    assert.equal(cities.length,2);
});

test('a cold city never admits a party larger than its configured cap',async()=>{
    const {pool,cities}=fixture([2]);
    await assert.rejects(pool.allocate(3),CapacityUnavailable);
    assert.equal(cities.length,0);
    assert.equal((await pool.allocate(2)).id,'1');
});

test('a retiring city still occupies its configured slot until its process is removed',async()=>{
    const {pool,cities}=fixture([2]);
    await pool.allocate(2);cities[0].players=2;
    await assert.rejects(pool.allocate(),CapacityUnavailable);
    cities[0].players=0;
    await assert.rejects(pool.allocate(),CapacityUnavailable);
    await assert.rejects(pool.allocate(),CapacityUnavailable);
    assert.equal(cities.length,1);
    cities.splice(0,1);
    await pool.allocate(2);
    assert.equal(cities.length,1);
});

test('a retiring first city cannot expand the next city beyond its own cap',async()=>{
    const {pool,cities}=fixture([2,1]);
    await pool.allocate(2);await pool.allocate();
    cities[0].players=2;cities[1].players=1;
    await assert.rejects(pool.allocate(),CapacityUnavailable);
    cities[0].players=0;
    await assert.rejects(pool.allocate(),CapacityUnavailable);
    assert.equal(cities.length,2);
});

test('a later cold city uses its own smaller cap before starting',async()=>{
    const {pool,cities}=fixture([4,2]);
    await pool.allocate(4);
    await assert.rejects(pool.allocate(3),CapacityUnavailable);
    assert.equal(cities.length,1);
    assert.equal((await pool.allocate(2)).id,'2');
});
