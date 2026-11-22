import test from 'node:test';
import assert from 'node:assert/strict';
import {blochPoint} from './crafted-bloch.js';
const near=(a,b)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<1e-12));
test('computational basis and positive Y map into the declared world frame',()=>{
 near(blochPoint(0,0),[0,1,0]);
 near(blochPoint(Math.PI,1.7),[0,-1,0]);
 near(blochPoint(Math.PI/2,0),[1,0,0]);
 near(blochPoint(Math.PI/2,Math.PI/2),[0,0,-1]);
});
test('authored sweep preserves pure-state radius and a full turn returns to its start',()=>{
 const theta=55*Math.PI/180,phi=35*Math.PI/180;
 assert.ok(Math.abs(Math.hypot(...blochPoint(theta,phi))-1)<1e-12);
 near(blochPoint(theta,phi),blochPoint(theta,phi+2*Math.PI));
});
