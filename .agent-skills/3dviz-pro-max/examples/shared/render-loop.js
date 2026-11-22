// Demand-driven rendering: a still scene holds no pending animation frame.
export function createRenderLoop({draw,request=requestAnimationFrame,cancel=cancelAnimationFrame,fps=60}){
 let pending=null,previous=null,lastRender=null,active=true,drawing=false,dirty=false;
 function invalidate(){dirty=true;if(active&&!drawing&&pending===null)pending=request(frame);}
 function frame(timestamp){
  pending=null;if(!active)return;
  // A fresh start has no previous timestamp, so this frame carries dt 0 and a model whose
  // update(dt) reports motion only for dt > 0 cannot ask for the next frame yet: keep one more.
  const fresh=previous===null,elapsed=fresh?0:timestamp-previous;
  if(lastRender!==null&&timestamp-lastRender<1000/fps){pending=request(frame);return;}
  previous=timestamp;lastRender=timestamp;dirty=false;drawing=true;
  let moving=false;
  try{moving=draw(Math.min(elapsed/1000,.05));}finally{drawing=false;}
  if(active&&(moving||dirty||fresh))pending=request(frame);else previous=null;
 }
 return {invalidate,setActive(value){active=value;if(!active){if(pending!==null)cancel(pending);pending=null;previous=null;lastRender=null;}else invalidate();},
  dispose(){active=false;if(pending!==null)cancel(pending);pending=null;}};
}
