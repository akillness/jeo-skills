import {THREE,mesh,sphere,materialFor} from './scene-kit.js';
import {meshColliders} from './village-colliders.js';
import {createSupportQuery} from './village-support.js';
import {makeWater} from './village-water.js';
import {plantIsland,reedBanks,shoreRocks,yardProps} from './village-nature.js';
import {nearestPathPoint} from './kits/layout/village-layout.js';
const box=(g,c,p,s)=>mesh(g,new THREE.BoxGeometry(...s),c,p);
// Deterministic jitter (mulberry32): the same build draws the same frame, so captures compare.
function makeRandom(seed){return()=>{seed=(seed+0x6d2b79f5)|0;let t=Math.imul(seed^(seed>>>15),1|seed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};}
// Decorative repeats collapse into one draw call each. Position, rotation and scale stay per
// instance, and setColorAt adds a +/-4% hue jitter so a drift never reads as stamped clones.
function scatter(g,geometry,items,options={}){
 const instances=new THREE.InstancedMesh(geometry,materialFor(0xffffff,options),items.length);
 const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),euler=new THREE.Euler(),position=new THREE.Vector3(),size=new THREE.Vector3();
 const tint=new THREE.Color(),hsl={h:0,s:0,l:0},random=makeRandom(20260908+items.length);
 items.forEach((item,i)=>{
  euler.set(...(item.rotation??[0,0,0]));quaternion.setFromEuler(euler);
  matrix.compose(position.set(...item.position),quaternion,size.set(...(item.scale??[1,1,1])));
  instances.setMatrixAt(i,matrix);
  tint.setHex(item.color).getHSL(hsl);
  instances.setColorAt(i,tint.setHSL((hsl.h+(random()-.5)*.08+1)%1,hsl.s,hsl.l));
 });
 instances.instanceMatrix.needsUpdate=true;if(instances.instanceColor)instances.instanceColor.needsUpdate=true;
 instances.castShadow=true;instances.receiveShadow=true;g.add(instances);return instances;
}
function tube(g,points,r,color){return mesh(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),32,r,6,false),color);}
// Flat walking ribbon with low bevelled shoulders, rather than a rounded pipe ridge.
function walkingPath(g,curve){
 const positions=[],indices=[];
 for(let i=0;i<=48;i++){
  const p=curve.getPoint(i/48),t=curve.getTangent(i/48);
  for(const [offset,drop] of [[-.6,.12],[-.34,0],[.34,0],[.6,.12]])positions.push(p.x+t.z*offset,p.y-drop,p.z-t.x*offset);
  if(i<48)for(let j=0;j<3;j++){const a=i*4+j,b=a+4;indices.push(a,b,a+1,a+1,b,b+1);}
 }
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 return mesh(g,geometry,0xd4b992);
}
export function makeLandscape(g){
 const solids=[],colliders=[];
 mesh(g,new THREE.CylinderGeometry(7.7,6.7,1.25,56),0x52696a,[0,-.72,0]);
 mesh(g,new THREE.CylinderGeometry(6.8,5.8,.65,48),0x3c515b,[0,-1.6,0]);
 mesh(g,new THREE.CylinderGeometry(7.73,7.69,.22,56),0x769174,[0,-.03,0]);
 shoreRocks(g);
 for(const [x,z,r] of [[-2.4,-3.8,2.2],[.2,-4.7,1.65]]){mesh(g,new THREE.CylinderGeometry(r,r+.17,.3,24),0x8b9b79,[x,.19,z]);mesh(g,new THREE.CylinderGeometry(r+.1,r+.25,.17,24),0x78857a,[x,.08,z]);}
 // Raised, curved paths sit on the meadow, with edging made of irregular pavers.
 const trails=[[[0,.18,5.7],[-.9,.18,3.8],[-1.3,.18,1.7],[-.2,.18,.2],[1.1,.18,-1.8],[.1,.45,-3.6]], [[-4.1,.2,1.45],[-2.1,.2,1.55],[0,.2,1.9],[2,.2,2.4],[3.3,.2,4.4]], [[-.3,.2,.2],[1.8,.2,-.4],[4.3,.2,-.8]], [[-2.1,.2,1.55],[-2.1,.2,-1.1],[-3.8,.4,-2.7]]];
 const pavers=[];
 // The lanes as the layout kit reads them: planVillage would site its own plots, which would move
 // every landmark the picking tests and the focus presets name, so only its lane maths is used.
 const lanes=trails.map((points,i)=>({name:`lane-${i}`,width:1.2,points:points.map(p=>[p[0],p[2]])}));
 for(const points of trails){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));walkingPath(g,curve);for(let i=0;i<28;i++){const p=curve.getPoint(i/27),t=curve.getTangent(i/27);for(const side of [-1,1])pavers.push({position:[p.x+t.z*.39*side,p.y*.65,p.z-t.x*.39*side],rotation:[0,Math.atan2(t.x,t.z),0],color:0xb0a390});}}
 scatter(g,new THREE.BoxGeometry(.15,.1,.2),pavers);
 // A broad turquoise pond connects to a winding stream beneath the bridge.
 const supportMeshes=[...g.children],deckMeshes=[];
 const water=makeWater(g),{pond,stream,curve:streamCurve}=water;solids.push(pond);
 for(let i=0;i<56;i++){const a=streamCurve.getPoint(i/56),b=streamCurve.getPoint((i+1)/56);colliders.push({min:[Math.min(a.x,b.x)-.47,-.1,Math.min(a.z,b.z)-.47],max:[Math.max(a.x,b.x)+.47,.32,Math.max(a.z,b.z)+.47],name:'stream'});}
 for(let i=0;i<30;i++){const a=i*2.4;const r=1.72;const stone=sphere(g,0xa4ada1,[1.15+Math.cos(a)*r*.8,.17,4.45+Math.sin(a)*r*1.2],.17+(i%3)*.04);stone.scale.y*=.6;}
 for(let i=0;i<8;i++){const x=.5+Math.sin(i*2.4)*.6,z=4.6+Math.cos(i*2.4)*.95;mesh(g,new THREE.CylinderGeometry(.17,.17,.02,16),0x789564,[x,.185,z]);if(i%3===0)sphere(g,0xf3c8b8,[x,.23,z],.1);}
 // Continuous deck and approaches provide support; only rails and deck underside obstruct.
 const bridge=new THREE.Group();bridge.position.set(1.73,0,1.53);bridge.rotation.y=.18;g.add(bridge);
 const deck=box(bridge,0xb99c74,[0,.56,0],[2.32,.12,1.8]);deck.name='bridge-deck';deckMeshes.push(deck);
 solids.push(deck);
 const rise=.44,run=1.15,angle=Math.atan2(rise,run);
 for(const side of [-1,1]){
  const ramp=box(bridge,0xb99c74,[side*1.725,.4-.06*Math.cos(angle),0],[Math.hypot(run,rise),.12,1.8]);
  ramp.rotation.z=-side*angle;
  // Offset the centre so the top surface meets the deck at x=+/-1.15.
  ramp.position.x-=side*.06*Math.sin(angle);ramp.name='bridge-approach';deckMeshes.push(ramp);
 }
 for(let i=0;i<23;i++)box(bridge,0x8d7257,[-1.1+i*.1,.621,0],[.012,.002,1.8]);
 const rails=new THREE.Group();bridge.add(rails);solids.push(rails);
 for(const z of [-1,1]){
  const railPoints=[[-2.3,.72,z],[-1.15,1.16,z],[0,1.16,z],[1.15,1.16,z],[2.3,.72,z]];
  for(let i=1;i<railPoints.length;i++)tube(rails,[railPoints[i-1],railPoints[i]],.045,0x705446);
  for(const x of [-2.25,-1.15,0,1.15,2.25]){
   const y=Math.abs(x)<=1.15?.62:.62-(Math.abs(x)-1.15)*rise/run;
   box(rails,0x705446,[x,y+.25,z],[.07,.55,.07]);sphere(rails,0xd3b481,[x,y+.55,z],.06);
  }
 }
 // Trees, reed banks and yard props are kit blueprints; village-nature.js holds the planting.
 colliders.push(...plantIsland(g));
 reedBanks(g);
 // Lantern heads. Their world positions are published so a look with practicals
 // (knowledge.lighting-mood-night-lantern) can hang a PointLight in each glass.
 const lanterns=[];
 function lantern(x,z){const start=g.children.length;mesh(g,new THREE.CylinderGeometry(.035,.065,1.45,6),0x5d5251,[x,.84,z]);const arm=box(g,0x5d5251,[x+.12,1.55,z],[.32,.055,.055]);box(g,0xf4c272,[x+.24,1.33,z],[.18,.28,.18]);mesh(g,new THREE.ConeGeometry(.18,.17,4),0x695350,[x+.24,1.57,z]);mesh(g,new THREE.SphereGeometry(1,20,12),0xffd798,[x+.24,1.36,z+.1],{emissive:0xffbe6a,emissiveIntensity:1.4}).scale.setScalar(.07);lanterns.push([x+.24,1.36,z+.1]);solids.push(...g.children.slice(start));}
 [[-3.8,4.5],[-2.2,1.9],[.1,-1],[2.8,.8],[4.5,4.5],[-4.7,1.5],[-1.1,-3.2]].forEach(p=>lantern(...p));
 // Flower drifts and planted vegetable rows leave the circulation paths open.
 const blades=[],stems=[],petals=[];
 for(let i=0;i<90;i++){const a=i*2.399,r=5.5+(i%7)*.19,x=Math.cos(a)*r,z=Math.sin(a)*r;if(((x-1.15)/1.4)**2+((z-4.45)/2.1)**2<1)continue;if(x> -6.85&&x< -4.75&&z>1.25&&z<3.15)continue;
  if(nearestPathPoint(lanes,[x,z]).distance<.85)continue;
  if(i%3===0)blades.push({position:[x,.28,z],rotation:[0,i*.7,.2],color:0x728c61});
  else{stems.push({position:[x,.23,z],rotation:[0,i*.9,0],color:0x4d7d57});petals.push({position:[x,.37,z],rotation:[0,i*1.3,0],scale:[1,.58,1],color:[0xe8ba79,0xc390b9,0xf1dfbb][i%3]});}}
 scatter(g,new THREE.ConeGeometry(.12,.36,4),blades);
 scatter(g,new THREE.CylinderGeometry(.012,.014,.2,4),stems);
 scatter(g,new THREE.SphereGeometry(.085,10,6),petals);
 for(let row=0;row<3;row++){box(g,0x786052,[-4.45,.16,2.5+row*.42],[1.25,.12,.28]);for(let j=0;j<6;j++){const plant=sphere(g,0x8fa969,[-4.98+j*.21,.3,2.5+row*.42],.12);plant.scale.y*=1.3;}}
 colliders.push(...yardProps(g));
 // The only surfaces authored above the 1.0 bloom threshold, so bloom has one honest source.
 const motes=[];for(let i=0;i<15;i++){const a=i*2.4;const o=mesh(g,new THREE.SphereGeometry(1,20,12),0xffda85,[Math.cos(a)*4.5,.7+(i%5)*.2,Math.sin(a)*4.5],{emissive:0xffb459,emissiveIntensity:2});o.scale.setScalar(.025);o.castShadow=false;motes.push(o);}
 g.updateMatrixWorld(true);
 const {groundHeight,supportAt}=createSupportQuery({ground:supportMeshes,deck:deckMeshes,water:[pond,stream]});
 let flow=1,flowPhase=0,elapsed=0;
 function renderFlow(){water.render(flowPhase);}
 function reset(){flow=1;flowPhase=0;elapsed=0;renderFlow();motes.forEach((m,i)=>{m.position.y=.8+(i%4)*.22+Math.sin(i)*.2;});}
 for(const solid of solids)colliders.push(...meshColliders(solid,solid.name||'landscape'));
 colliders.push({min:[-8,-2,-8],max:[8,.08,8],name:'ground'});
 reset();
 return {colliders,groundHeight,supportAt,reset,lanterns,get flow(){return flow;},get flowPhase(){return flowPhase;},
  setFlow(value){if(!Number.isFinite(value))throw new TypeError('Flow must be finite');flow=Math.max(0,Math.min(2,value));},
  update(_time,dt=0){if(!(dt>0))return;elapsed+=Math.min(dt,.25);flowPhase=(flowPhase+Math.min(dt,.25)*flow*.08)%1;renderFlow();
   motes.forEach((m,i)=>{m.position.y=.8+(i%4)*.22+Math.sin(elapsed*.7+i)*.2;});
  }};
}
