import {THREE,mesh,sphere} from './scene-kit.js';
import {creatureEnvelope} from './village-colliders.js';
import {createBody,createNavigator,integrate,fixedStepper,acceptGroundMovement} from './village-physics.js';
import {createLocomotion,advanceLocomotion} from './village-locomotion.js';
import {create as quadrupedWalker} from './kits/creatures/quadruped-walker.js';
const ell=(g,c,p,s)=>{const o=sphere(g,c,p);o.scale.set(...s);return o;};
function limb(g,c,p,length=.32,r=.055){const joint=new THREE.Group();joint.position.set(...p);g.add(joint);mesh(joint,new THREE.CylinderGeometry(r,r*.82,length,8),c,[0,-length/2,0]);ell(joint,c,[0,-length,.035],[r*1.1,r*.75,r*1.5]);return joint;}
function line(g,a,b,r,c){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));const o=mesh(g,new THREE.CylinderGeometry(r*.55,r,v.length(),7),c,new THREE.Vector3(...a).addScaledVector(v,.5).toArray());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());return o;}
function eyes(g,y,z,x=.12){for(const s of [-1,1]){ell(g,0x243e43,[s*x,y,z],[.043,.055,.031]);sphere(g,0xfff5dd,[s*x-.009,y+.013,z+.023],.013);}}
function fox(){const g=new THREE.Group(),legs=[],tails=[];ell(g,0xe6a76a,[0,.55,0],[.28,.29,.53]);ell(g,0xf2bb7b,[0,.82,.43],[.28,.26,.26]);ell(g,0xffdfb2,[0,.72,.62],[.19,.14,.22]);sphere(g,0x574447,[0,.76,.81],.055);eyes(g,.9,.637,.14);
 for(const s of [-1,1]){const ear=mesh(g,new THREE.ConeGeometry(.13,.38,7),0xe6a76a,[s*.2,1.1,.42]);ear.rotation.z=-s*.22;const inner=mesh(g,new THREE.ConeGeometry(.075,.25,6),0x805662,[s*.2,1.12,.49]);inner.rotation.z=-s*.22;for(const z of [-.29,.3])legs.push(limb(g,0x875c49,[s*.19,.48,z],.3,.065));}
 for(let i=0;i<3;i++){const tail=new THREE.Group();tail.position.set((i-1)*.13,.55,-.42);tail.rotation.set(-.55,0,(i-1)*.6);g.add(tail);ell(tail,0xe7a874,[0,.15,-.26],[.15,.17,.37]);ell(tail,0xffe4b4,[0,.27,-.59],[.145,.16,.21]);tails.push(tail);}
 return {g,animate(t,{phase=t*5,amplitude=1}={}){legs.forEach((l,i)=>l.rotation.x=Math.sin(phase+(i%3)*Math.PI)*.4*amplitude);tails.forEach((tail,i)=>tail.rotation.y=Math.sin(t*2+i)*.18);}};}
// The moon deer is kits/creatures/quadruped-walker: a horned, hoofed quadruped is exactly what
// the blueprint builds. Its gait stays this scene's business - village-locomotion.js owns leg
// phase, so the kit's route stepping is switched off (`route:null`, `moving:false`) and the rig
// is posed as a pure function of (time, phase, amplitude), the same contract the authored
// animals have. Calling the kit's animate(dt) as a driver as well would fight the locomotion.
// The three-tail fox stays authored: the blueprint always builds horns and one tail, so it
// cannot represent that creature without misdescribing it.
const DEER_RIG=1.7,DEER_DUTY=.62,POSE_STEP=1/240;
function deer(){
 const kit=quadrupedWalker({scale:DEER_RIG,coat:'#c5d3c0',seed:12,
  strideM:.65/(.5*DEER_RIG*DEER_DUTY),yawRateRad:2});
 const g=new THREE.Group();g.add(kit.group);
 Object.assign(kit.state,{route:null,moving:false});
 const cruise=kit.state.speed;
 return {g,animate(t,{phase=t*3.8,amplitude=1}={}){
  // Time is written, not accumulated, so two calls at the same t leave an identical pose and
  // a paused frame stays byte-identical.
  kit.state.time=t;kit.state.phase=phase/(2*Math.PI);
  kit.animate(POSE_STEP,cruise*Math.max(0,Math.min(1,amplitude)));
 }};}
function dragon(){const g=new THREE.Group(),wings=[],legs=[];ell(g,0x659c9d,[0,.53,0],[.29,.28,.66]);ell(g,0x98c9b0,[0,.51,.19],[.25,.23,.39]);ell(g,0x639d9e,[0,.81,.54],[.29,.23,.3]);ell(g,0x91c2b1,[0,.73,.77],[.24,.14,.23]);eyes(g,.88,.777,.18);
 for(const s of [-1,1]){const horn=mesh(g,new THREE.ConeGeometry(.075,.29,7),0xf1d2a0,[s*.21,1.06,.42]);horn.rotation.z=-s*.25;for(const z of [-.35,.34])legs.push(limb(g,0x629692,[s*.24,.43,z],.23,.075));const wing=new THREE.Group();wing.position.set(s*.2,.72,-.1);g.add(wing);const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(s*.3,.6);shape.lineTo(s*1.2,.7);shape.lineTo(s*.86,.14);shape.lineTo(s*.52,.25);shape.lineTo(s*.26,-.15);shape.closePath();mesh(wing,new THREE.ShapeGeometry(shape),0xb99ac7,[0,0,0],{side:THREE.DoubleSide});for(const p of [[s*.3,.6,0],[s*1.2,.7,0],[s*.52,.25,0]])line(wing,[0,0,0],p,.024,0x6b7d8d);wings.push(wing);}
 const tail=new THREE.Group();tail.position.set(0,.56,-.55);g.add(tail);const curve=new THREE.CatmullRomCurve3([[0,0,0],[.15,.03,-.4],[.36,.15,-.73],[.48,.29,-.89]].map(p=>new THREE.Vector3(...p)));mesh(tail,new THREE.TubeGeometry(curve,16,.08,7,false),0x629d9e);for(let i=0;i<6;i++)mesh(g,new THREE.ConeGeometry(.07,.18,5),0xeac38f,[0,.81+i*.011,.3-i*.17]);
 // A grounded wing stretch is an expressive gesture, not a lift-producing flap.
 return {g,animate(t,{phase=t*4,amplitude=1}={}){const stretch=Math.max(0,Math.sin(t*.75))**4;wings.forEach((w,i)=>w.rotation.y=stretch*(i?1:-1)*.5);tail.rotation.y=Math.sin(t*2)*.22;legs.forEach((l,i)=>l.rotation.x=Math.sin(phase+(i%3)*Math.PI)*.35*amplitude);}};}
function owl(){const g=new THREE.Group(),wings=[];ell(g,0x8f8fbc,[0,.48,0],[.31,.42,.26]);ell(g,0xd7d1e2,[0,.69,.19],[.28,.25,.11]);for(const s of [-1,1]){ell(g,0xf2e7cf,[s*.135,.75,.275],[.12,.13,.065]);ell(g,0x414a67,[s*.135,.75,.329],[.063,.081,.023]);sphere(g,0xffffff,[s*.13,.778,.348],.02);const ear=mesh(g,new THREE.ConeGeometry(.105,.29,7),0x8f8fbc,[s*.22,1,.03]);ear.rotation.z=-s*.32;const wing=new THREE.Group();wing.position.set(s*.27,.62,0);g.add(wing);for(let i=0;i<4;i++){const feather=ell(wing,[0x8e8db7,0xaaa1ce][i%2],[s*(.15+i*.075),-.05-i*.05,-i*.05],[.21,.09,.12]);feather.rotation.z=-s*.35;}wings.push(wing);limb(g,0xe5bb82,[s*.13,.15,.04],.12,.035);}
 const beak=mesh(g,new THREE.ConeGeometry(.07,.15,5),0xe8bc79,[0,.62,.32]);beak.rotation.x=-Math.PI/2;
 return {g,animate(t){wings.forEach((w,i)=>w.rotation.z=Math.sin(t*5)*(i?-1:1)*.45);g.rotation.z=Math.sin(t*1.6)*.06;}};}
export function makeCreatures(parent,{boxes,groundHeight,supportAt}){
 const creatures=[fox(),deer(),dragon(),owl()];
 const goals=[ [[-.5,0,2.8],[-1.5,0,4.6],[-.8,0,.1]], [[-2.7,0,4.5],[-2.7,0,3.15],[-1.8,0,3.15]], [[4.5,0,.7],[4.8,0,1.6],[3.8,0,.2]], [[.4,5.8,-.6],[-3.4,5.8,.1],[.5,5.8,2.8],[3.5,5.8,-1.5]] ];
 const actors=creatures.map((c,i)=>{
  c.g.scale.setScalar([.45,.5,.35,.6][i]);
  const envelope=creatureEnvelope(c),flying=i===3;
  // Yaw-invariant search extents include leg anchors, stride reach and feet, not tails.
  const footHalf=Array(2).fill([.28,.32,.25,0][i]);
  const nav=createNavigator({boxes,half:envelope.half,flying,groundHeight,supportAt,footHalf,bottom:envelope.half[1]});
  const position=nav.nearest(goals[i][0]);if(!position)throw new Error(`No clear creature spawn for actor ${i} at ${goals[i][0]}`);
  const body=createBody({position,half:envelope.half,maxSpeed:flying?.8:.42,maxAcceleration:flying?1.1:.85});
  if(!flying&&supportAt){
   let supported=acceptGroundMovement(body,[...body.position],{supportAt,footHalf,boxes}).accepted;
   // Search nearby navigation cells when a clear center has unsupported foot probes.
   for(let ring=1;!supported&&ring<=8;ring++)for(let dx=-ring;!supported&&dx<=ring;dx++)for(let dz=-ring;!supported&&dz<=ring;dz++){
    if(Math.max(Math.abs(dx),Math.abs(dz))!==ring)continue;
    const candidate=nav.nearest([position[0]+dx*.45,position[1],position[2]+dz*.45]);
    if(!candidate)continue;body.position=[...candidate];
    supported=acceptGroundMovement(body,candidate,{supportAt,footHalf,boxes}).accepted;
   }
   if(!supported)throw new Error('Creature spawn has no safe ground support');
  }
  const initialBody=structuredClone(body);
  // `object` is the creature root: the picker resolves a canvas hit up to this node.
  parent.add(c.g);return {c,object:c.g,body,initialBody,nav,envelope,footHalf,flying,goals:goals[i],goal:1,path:[],distance:0,
   ...createLocomotion({stride:[.5,.65,.4,1][i],turnRate:flying?1.5:2}),
   status:flying?'flying':'idle',restRemaining:0,retryRemaining:0,stalledFor:0,restDuration:1.1+i*.2};
 });
 let elapsed=0;
 const stepper=fixedStepper(dt=>{elapsed+=dt;for(const a of actors){
  a.retryRemaining=Math.max(0,a.retryRemaining-dt);
  if(!a.path.length&&a.restRemaining<=0&&a.retryRemaining<=0){
   a.path=a.nav.route(a.body.position,a.goals[a.goal]);
   if(!a.path.length){a.status='blocked';a.retryRemaining=.8;a.goal=(a.goal+1)%a.goals.length;}
  }
  let target=a.path[0];
  while(target&&Math.hypot(...target.map((v,i)=>v-a.body.position[i]))<.12){
   a.path.shift();target=a.path[0];
   if(!target){a.goal=(a.goal+1)%a.goals.length;a.restRemaining=a.restDuration;}
  }
  const previous=[...a.body.position];integrate(a.body,target??a.body.position,dt,boxes);
  let supportAccepted=true;
  if(!a.flying){
   if(supportAt)supportAccepted=acceptGroundMovement(a.body,previous,{supportAt,footHalf:a.footHalf,boxes}).accepted;
   else a.body.position[1]=groundHeight(a.body.position[0],a.body.position[2])+a.body.half[1];
  }
  const travel=advanceLocomotion(a,previous,a.body.position,dt,a.body.maxSpeed);
  a.distance+=Math.hypot(...a.body.position.map((v,i)=>v-previous[i]));
  const moving=travel>1e-7||(a.flying&&Math.abs(a.body.position[1]-previous[1])>1e-7);
  a.stalledFor=target&&!moving?a.stalledFor+dt:0;
  if(a.stalledFor>.6){a.path=[];a.retryRemaining=.8;a.goal=(a.goal+1)%a.goals.length;a.status='blocked';}
  else if(a.retryRemaining>0||!supportAccepted)a.status='blocked';
  else a.status=a.flying?'flying':moving?'walking':'idle';
  // The rest clock starts only after deceleration, so every goal has a visible hold.
  if(a.restRemaining>0&&!moving)a.restRemaining=Math.max(0,a.restRemaining-dt);
 }});
 function render(){for(const a of actors){a.c.animate(elapsed,{phase:a.gaitPhase,amplitude:a.gaitAmplitude});a.c.g.rotation.y=a.heading;a.c.g.position.set(a.body.position[0],a.body.position[1]-a.envelope.center,a.body.position[2]);}}
 function reset(){elapsed=0;stepper.reset();for(const a of actors){
  Object.assign(a.body,structuredClone(a.initialBody));
  Object.assign(a,createLocomotion({stride:a.stride,turnRate:a.turnRate}),{goal:1,path:[],distance:0,
   status:a.flying?'flying':'idle',restRemaining:0,retryRemaining:0,stalledFor:0});
  a.c.g.rotation.set(0,0,0);
 }render();}
 reset();return {actors,get elapsed(){return elapsed;},get status(){return actors.map(a=>a.status);},reset,
  update(_time,dt=0){stepper.advance(dt);render();}};
}
