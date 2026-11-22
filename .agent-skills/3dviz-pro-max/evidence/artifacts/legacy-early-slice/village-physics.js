// Kinematic locomotion: acceleration-limited steering, swept solid contacts, and grid navigation.
// Ground support and hovering are authored constraints, not rigid-body dynamics or aerodynamics.
const EPS=1e-5;
const length=v=>Math.hypot(...v);
const subtract=(a,b)=>a.map((n,i)=>n-b[i]);
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
export function expanded(box,half,margin=0){return {min:box.min.map((n,i)=>n-half[i]-margin),max:box.max.map((n,i)=>n+half[i]+margin)};}
export function overlaps(position,half,box){const b=expanded(box,half);return position.every((n,i)=>n>b.min[i]+EPS&&n<b.max[i]-EPS);}
export function sweep(position,delta,half,boxes){
 let best=null;
 for(const box of boxes){const b=expanded(box,half);let enter=-Infinity,leave=Infinity,axis=-1,sign=0,miss=false;
  for(let i=0;i<3;i++){
   if(Math.abs(delta[i])<EPS){if(position[i]<=b.min[i]||position[i]>=b.max[i]){miss=true;break;}continue;}
   let a=(b.min[i]-position[i])/delta[i],z=(b.max[i]-position[i])/delta[i];const normal=delta[i]>0?-1:1;
   if(a>z)[a,z]=[z,a];if(a>enter){enter=a;axis=i;sign=normal;}leave=Math.min(leave,z);if(enter>leave){miss=true;break;}
  }
  if(miss||enter< -EPS||enter>1||leave<0||axis<0)continue;
  if(!best||enter<best.time){const normal=[0,0,0];normal[axis]=sign;best={time:Math.max(0,enter),normal,box};}
 }
 return best;
}
export function integrate(state,target,dt,boxes){
 if(!(dt>0))return;
 const offset=subtract(target,state.position),distance=length(offset);
 const desiredSpeed=Math.min(state.maxSpeed,Math.sqrt(2*state.maxAcceleration*distance));
 const desired=distance>EPS?offset.map(n=>n/distance*desiredSpeed):[0,0,0];
 const change=subtract(desired,state.velocity),changeLength=length(change),limit=state.maxAcceleration*dt;
 state.velocity=state.velocity.map((n,i)=>n+change[i]*(changeLength>limit?limit/changeLength:1));
 let remaining=dt;
 for(let contact=0;contact<3&&remaining>EPS;contact++){
  const delta=state.velocity.map(n=>n*remaining),hit=sweep(state.position,delta,state.half,boxes);
  if(!hit){state.position=state.position.map((n,i)=>n+delta[i]);break;}
  const safeTime=Math.max(0,hit.time-EPS/Math.max(length(delta),EPS));
  state.position=state.position.map((n,i)=>n+delta[i]*safeTime);
  const inward=dot(state.velocity,hit.normal);
  if(inward<0)state.velocity=state.velocity.map((n,i)=>n-inward*hit.normal[i]);
  remaining*=1-hit.time;state.contacts++;
 }
}
// Validate the support correction after steering, before measuring accepted travel.
// Rejection returns to the previous accepted position; it never snaps to another surface.
export function acceptGroundMovement(state,previous,{supportAt,boxes=[],bottom=state.half[1],
 maxStep=.18,maxSlope=Math.PI/4,searchAbove=.2,searchBelow=.3,footHalf=[state.half[0]*.65,state.half[2]*.65]}={}){
 const reject=(reason,support=null)=>{state.position=[...previous];state.velocity=[0,0,0];return {accepted:false,reason,support};};
 if(typeof supportAt!=='function')return reject('missing-support-query');
 const referenceHeight=previous[1]-bottom;
 const options={referenceHeight,maxStep,maxSlope,searchAbove,searchBelow};
 const support=supportAt(state.position[0],state.position[2],options);
 if(!support?.walkable||!Number.isFinite(support.height))return reject(support?.reason??'no-support',support);
 if(Math.abs(support.height-referenceHeight)>maxStep+EPS)return reject('step-limit',support);
 if(!support.normal?.every(Number.isFinite)||support.normal[1]<Math.cos(maxSlope)-EPS)return reject('slope-limit',support);
 // Five probes bound the authored foot-search region; these are not a terrain contact solver.
 for(const [dx,dz] of [[-1,-1],[-1,1],[1,-1],[1,1]]){
  const foot=supportAt(state.position[0]+dx*footHalf[0],state.position[2]+dz*footHalf[1],
   {...options,referenceHeight:support.height});
  if(!foot?.walkable||!Number.isFinite(foot.height))return reject('foot-support',foot);
 }
 const projected=[state.position[0],support.height+bottom,state.position[2]];
 if(boxes.some(box=>overlaps(projected,state.half,box)))return reject('support-overlap',support);
 const correction=subtract(projected,state.position);
 const projectionHit=sweep(state.position,correction,state.half,boxes);
 if(projectionHit&&(1-projectionHit.time)*length(correction)>EPS)return reject('support-sweep',support);
 // Also check the complete accepted displacement, rather than only the final height.
 const movementHit=sweep(previous,subtract(projected,previous),state.half,boxes);
 if(movementHit&&(1-movementHit.time)*length(subtract(projected,previous))>EPS)return reject('movement-sweep',support);
 state.position=projected;state.velocity[1]=0;
 return {accepted:true,reason:null,support};
}
export function createBody({position,half,maxSpeed=.65,maxAcceleration=1.25}){return {position:[...position],velocity:[0,0,0],half:[...half],maxSpeed,maxAcceleration,contacts:0};}
export function resetBody(state,position){state.position=[...position];state.velocity=[0,0,0];state.contacts=0;}
export function fixedStepper(step,interval=1/90){let remainder=0;return {advance(dt){if(!(dt>0))return;remainder+=Math.min(dt,.25);while(remainder+EPS>=interval){step(interval);remainder-=interval;}},reset(){remainder=0;}};}
function clearSegment(a,b,half,boxes){
 const hit=sweep(a,subtract(b,a),half,boxes);
 // Ending exactly on a support surface is contact, not an obstructed route.
 return (!hit||(1-hit.time)*length(subtract(b,a))<=EPS)&&!boxes.some(box=>overlaps(b,half,box));
}
// A* navigation uses the same expanded collider volumes as movement. Extra clearance
// absorbs steering corners; each smoothed link is swept again before being accepted.
export function createNavigator({boxes,half,flying=false,groundHeight=()=>.1,supportAt,footHalf,bottom=half[1],radius=7.55,spacing=.45}){
 const margin=.08,navHalf=half.map((n,i)=>n+(i===1?0:margin)),cache=new Map(),ny=flying?14:1;
 const points=new Map();
 const point=(x,y,z)=>{const key=[x,y,z].join();if(!points.has(key))points.set(key,[x*spacing,flying?.8+y*spacing:groundHeight(x*spacing,z*spacing)+bottom,z*spacing]);return points.get(key);};
 function valid(p){
  if(Math.hypot(p[0],p[2])+Math.max(half[0],half[2])>radius)return false;
  if(boxes.some(b=>overlaps(p,navHalf,b)))return false;
  if(flying||!supportAt)return true;
  const probe={position:[...p],velocity:[0,0,0],half};
  return acceptGroundMovement(probe,p,{supportAt,bottom,boxes,footHalf}).accepted;
 }
 function clear(a,b,clearHalf=navHalf){
  if(!clearSegment(a,b,clearHalf,boxes))return false;
  if(flying||!supportAt)return true;
  const steps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])/.15));
  const probe={position:[...a],velocity:[0,0,0],half};
  for(let i=1;i<=steps;i++){
   const previous=[...probe.position];
   probe.position=[a[0]+(b[0]-a[0])*i/steps,previous[1],a[2]+(b[2]-a[2])*i/steps];
   if(!acceptGroundMovement(probe,previous,{supportAt,bottom,boxes,footHalf}).accepted)return false;
  }
  return true;
 }
 const index=p=>[Math.round(p[0]/spacing),flying?Math.round((p[1]-.8)/spacing):0,Math.round(p[2]/spacing)];
 function nearest(p){const [x,y,z]=index(p);let best=null,d=Infinity;for(let r=0;r<8;r++){for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)for(let dy=flying?-Math.min(r,4):0;dy<=(flying?Math.min(r,4):0);dy++){const q=[x+dx,Math.max(0,Math.min(ny,y+dy)),z+dz],v=point(...q),dist=length(subtract(v,p));if(valid(v)&&dist<d){best=q;d=dist;}}if(best)return best;}return null;}
 function route(from,to){const start=nearest(from),end=nearest(to);if(!start||!end)return [];
  const endPoint=point(...end),key=end.join(),open=[{q:start,g:0,f:0}],nodes=new Map([[start.join(),{g:0,parent:null}]]),closed=new Set();let found=false;
  while(open.length){let best=0;for(let i=1;i<open.length;i++)if(open[i].f<open[best].f)best=i;const current=open.splice(best,1)[0],id=current.q.join();if(closed.has(id))continue;if(id===key){found=true;break;}closed.add(id);
   for(const delta of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],...(flying?[[0,1,0],[0,-1,0]]:[])]){const q=current.q.map((n,i)=>n+delta[i]),nextId=q.join();if(q[1]<0||q[1]>ny||Math.abs(q[0])>18||Math.abs(q[2])>18||closed.has(nextId))continue;
    let pass=cache.get(nextId);const nextPoint=point(...q);if(pass===undefined){pass=valid(nextPoint);cache.set(nextId,pass);}if(!pass||!clear(point(...current.q),nextPoint))continue;
    const cost=current.g+length(subtract(nextPoint,point(...current.q)));if(cost>=(nodes.get(nextId)?.g??Infinity))continue;
    nodes.set(nextId,{g:cost,parent:id,q});open.push({q,g:cost,f:cost+length(subtract(nextPoint,endPoint))});
   }
  }
  if(!found)return [];const path=[];let id=key;while(id){const n=nodes.get(id);path.unshift(point(...(n.q??start)));id=n.parent;}
  const smooth=[];let at=0;while(at<path.length){smooth.push(path[at]);let next=path.length-1;while(next>at+1&&!clear(path[at],path[next]))next--;at=next>at?next:path.length;}
  return smooth;
 }
 return {route,valid,nearest(p){const q=nearest(p);return q?point(...q):null;},clear(a,b){return clear(a,b,half);}};
}
