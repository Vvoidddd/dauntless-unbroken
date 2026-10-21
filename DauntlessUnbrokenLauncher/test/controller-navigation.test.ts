import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ControllerInput} from '../src/renderer/controller-navigation';
const pad=(pressed:number[]=[],axes=[0,0,0,0])=>({buttons:Array.from({length:17},(_,i)=>({pressed:pressed.includes(i),touched:false,value:pressed.includes(i)?1:0})),axes});
test('controller confirmation is edge-triggered and a held button on reconnect/focus cannot activate anything',()=>{
 const input=new ControllerInput();
 assert.deepEqual(input.read(pad([0]),0).actions,[]);
 input.read(pad(),1);assert.deepEqual(input.read(pad([0]),2).actions,['confirm']);
 assert.deepEqual(input.read(pad([0]),1000).actions,[]);
 assert.deepEqual(input.read(pad([0,1]),1001).actions,['back']);
 input.reset();assert.deepEqual(input.read(pad([0]),2000).actions,[]);
});
test('sticks have a deadzone and D-pad navigation repeats at a bounded rate',()=>{
 const input=new ControllerInput();input.read(pad(),0);
 assert.deepEqual(input.read(pad([], [0.2,-0.2,0,0]),0).actions,[]);
 assert.deepEqual(input.read(pad([13]),1).actions,['down']);
 assert.deepEqual(input.read(pad([13]),300).actions,[]);
 assert.deepEqual(input.read(pad([13]),301).actions,['down']);
 assert.deepEqual(input.read(pad([13]),411).actions,['down']);
 assert.deepEqual(input.read(pad([14]),412).actions,['left']);
 input.read(pad(),413);assert.deepEqual(input.read(pad([], [NaN,NaN,0,0]),414).actions,[]);
 assert.equal(input.read(pad([], [0,0,0,1]),415).scroll,14);
});
