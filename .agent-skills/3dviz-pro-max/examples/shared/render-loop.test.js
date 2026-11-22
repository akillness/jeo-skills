import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderLoop} from './render-loop.js';

// Fake scheduler: frames run only when the test pumps them, with a monotonic clock.
function scheduler(){
 const queue=[];let now=0,id=0;
 return {
  request(fn){queue.push({id:++id,fn});return id;},
  cancel(handle){const i=queue.findIndex(f=>f.id===handle);if(i>=0)queue.splice(i,1);},
  pump(count,step=20){for(let i=0;i<count&&queue.length;i++){now+=step;const {fn}=queue.shift();fn(now);}},
  pending(){return queue.length;}
 };
}

test('a model that only reports motion for dt > 0 keeps animating after a fresh start',()=>{
 const s=scheduler(),dts=[];
 const loop=createRenderLoop({draw(dt){dts.push(dt);return dt>0;},request:s.request,cancel:s.cancel,fps:1000});
 loop.invalidate();
 s.pump(4);
 assert.equal(dts[0],0,'first frame after a start carries dt 0');
 assert.ok(dts.length>=4,'loop kept requesting frames');
 assert.ok(dts.slice(1).every(dt=>dt>0),'later frames carry real elapsed time');
 assert.equal(s.pending(),1,'still scheduled while the model reports motion');
});

test('a still model parks after the fresh frame and its follow-up',()=>{
 const s=scheduler();let frames=0;
 const loop=createRenderLoop({draw(){frames++;return false;},request:s.request,cancel:s.cancel,fps:1000});
 loop.invalidate();
 s.pump(5);
 assert.equal(frames,2,'fresh frame plus one confirmation frame, then parked');
 assert.equal(s.pending(),0);
});
