import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseLauncherAdmission} from '../src/main/hostapi';

test('queue details are bounded and stripped without breaking older servers',()=>{
 const base={state:'waiting',kind:'hunt',full:true,position:2,total:5};
 assert.deepEqual(parseLauncherAdmission({...base,token:'private'}),base);
 const details={...base,groupPosition:1,groupsTotal:3,waitSeconds:120,estimatedWaitSeconds:30,reason:'capacity'};
 assert.deepEqual(parseLauncherAdmission(details),details);
 for(const patch of [{waitSeconds:-1},{estimatedWaitSeconds:NaN},{groupPosition:4,groupsTotal:3},{reason:'secret'},{position:6},{groupsTotal:0}])assert.throws(()=>parseLauncherAdmission({...base,...patch}));
 assert.deepEqual(parseLauncherAdmission({state:'ready',token:'private'}),{state:'ready'});
});
