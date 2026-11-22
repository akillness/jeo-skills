import test from 'node:test';
import assert from 'node:assert/strict';
import {sarcomereState,REST_LENGTH,THIN_LENGTH,THICK_LENGTH} from '../sarcomere-model.js';

test('shortening measures actual Z-disc distance while filament lengths stay fixed',()=>{
 for(const fraction of [0,.125,.25]){
  const s=sarcomereState(fraction);
  assert.ok(Math.abs((REST_LENGTH-s.length)/REST_LENGTH-fraction)<1e-12);
  assert.equal(s.aBand,THICK_LENGTH);
  assert.ok(Math.abs(s.leftTip+s.half-THIN_LENGTH)<1e-12);
  assert.ok(Math.abs(s.half-s.rightTip-THIN_LENGTH)<1e-12);
 }
});
test('I-band portions and H zone narrow as fixed-length filaments overlap',()=>{
 const rest=sarcomereState(0),short=sarcomereState(.25);
 assert.ok(short.iHalf>0&&short.iHalf<rest.iHalf);
 assert.ok(short.hZone>0&&short.hZone<rest.hZone);
 assert.ok(Math.abs(short.hZone-(short.rightTip-short.leftTip))<1e-12);
 assert.equal(sarcomereState(-1).fraction,0);
 assert.equal(sarcomereState(1).fraction,.25);
});
