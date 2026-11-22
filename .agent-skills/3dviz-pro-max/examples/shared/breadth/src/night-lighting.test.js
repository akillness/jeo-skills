import test from 'node:test';
import assert from 'node:assert/strict';
import {keyPosition} from './night-lighting.js';
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-12));
test('azimuth turns the source around the target without changing height or radius',()=>{
 near(keyPosition(0,0,1),[0,.06,1]);
 near(keyPosition(90,0,1),[1,.06,0]);
 near(keyPosition(180,0,1),[0,.06,-1]);
});
test('elevation raises the key with the expected polar distance',()=>{
 const p=keyPosition(-65,30,.7);
 assert.ok(Math.abs(p[1]-.41)<1e-12);
 assert.ok(Math.abs(Math.hypot(p[0],p[1]-.06,p[2])-.7)<1e-12);
});
