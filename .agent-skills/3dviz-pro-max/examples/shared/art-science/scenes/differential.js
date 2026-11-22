import {THREE,mat,mesh,line,label} from '../scene-kit.js';
import {study,instrumentBase,ring,rounded,TAU} from '../study-kit.js';
import {differentialSpeeds} from './physics-models.js';
function bevelGear(radius,teeth,material){
 const g=new THREE.Group(),profile=[[radius*.22,-.18],[radius*.65,-.18],[radius*.82,-.09],[radius,.13],[radius*.72,.13],[radius*.22,.01]].map(p=>new THREE.Vector2(...p));
 mesh(new THREE.LatheGeometry(profile,96),material,[0,0,0],g);
 const tg=new THREE.BoxGeometry(radius*.12,.16,radius*.14),inst=new THREE.InstancedMesh(tg,material,teeth),d=new THREE.Object3D();
 for(let i=0;i<teeth;i++){const a=i/teeth*TAU;d.position.set(radius*.89*Math.cos(a),.065,radius*.89*Math.sin(a));d.rotation.set(0,-a,0);d.rotateZ(-.55);d.updateMatrix();inst.setMatrixAt(i,d.matrix);}g.add(inst);return g;
}
export function createScene(){
 const group=new THREE.Group(),{brass,dark}=instrumentBase(group,5.6,2.6,-1.6),steel=mat('#b3c4c1',.27,.8),blue=mat('#638e9b',.32,.5);let carrierSpeed=.8,bias=.35,angles=[0,0,0,0],opened=.8;
 const axles=[];for(const side of [-1,1]){const g=new THREE.Group();g.position.x=side*1.3;group.add(g);mesh(new THREE.CylinderGeometry(.1,.1,1.45,32),steel,[0,0,0],g).rotation.z=Math.PI/2;ring(.28,.055,brass,g,[side*.5,0,0]).rotation.y=Math.PI/2;for(let i=0;i<6;i++){const a=i/6*TAU;rounded([.5,.03,.03],blue,[side*.45,.105*Math.cos(a),.105*Math.sin(a)],g,.008);}axles.push(g);
  const block=rounded([.35,1.25,.62],dark,[side*1.9,-.85,0],group,.08);ring(.17,.045,brass,group,[side*1.9,0,0]).rotation.y=Math.PI/2;}
 const carrier=new THREE.Group();group.add(carrier);for(const x of [-.68,.68])ring(.95,.04,steel,carrier,[x,0,0]).rotation.y=Math.PI/2;
 for(const a of [0,Math.PI]){const y=.95*Math.cos(a),z=.95*Math.sin(a);rounded([1.4,.09,.09],steel,[0,y,z],carrier,.025);}
 const ringGear=ring(1.02,.05,brass,carrier,[-.7,0,0]);ringGear.rotation.y=Math.PI/2;
 for(let i=0;i<40;i++){const a=i/40*TAU;const o=rounded([.14,.095,.075],brass,[-.7,1.04*Math.cos(a),1.04*Math.sin(a)],carrier,.012);o.rotation.x=a;}
 const left=bevelGear(.58,24,brass),right=bevelGear(.58,24,blue);left.rotation.z=-Math.PI/2;right.rotation.z=Math.PI/2;const sideGroups=[];
 for(const [i,g] of [left,right].entries()){const pivot=new THREE.Group();pivot.position.x=(i?1:-1)*.48;pivot.add(g);group.add(pivot);sideGroups.push(pivot);}
 const pinions=[];for(const side of [-1,1]){const p=new THREE.Group();p.position.y=side*.48;const gear=bevelGear(.29,12,steel);gear.rotation.z=side>0?Math.PI:0;p.add(gear);carrier.add(p);pinions.push(p);}
 mesh(new THREE.CylinderGeometry(.045,.045,1.75,24),steel,[0,0,0],carrier);
 const cover=new THREE.Group();carrier.add(cover);for(const z of [-.6,.6])rounded([1.5,.58,.08],dark,[0,0,z],cover,.1);
 label('LEFT',[-2.1,.48,0],'#dfc69a',.12,group);label('RIGHT',[2.1,.48,0],'#a5c7d0',.12,group);
 function update(dt){const s=differentialSpeeds(carrierSpeed,bias);angles[0]+=dt*s.left;angles[1]+=dt*s.right;angles[2]+=dt*s.carrier;angles[3]+=dt*bias*2;sideGroups.forEach((g,i)=>g.rotation.x=angles[i]);axles.forEach((g,i)=>g.rotation.x=angles[i]);carrier.rotation.x=angles[2];pinions.forEach((g,i)=>g.rotation.y=(i?1:-1)*angles[3]);cover.children.forEach((o,i)=>o.position.z=(i?1:-1)*(.6+opened*.8));}
 const reset=()=>{carrierSpeed=.8;bias=.35;angles=[0,0,0,0];opened=.8;update(0);};update(0);
 return study(group,{update,reset,needsAnimation:()=>carrierSpeed!==0||bias!==0,controls:[{id:'speed',label:'Carrier angular velocity (rad/s)',type:'range',min:0,max:1.8,step:.05,get:()=>carrierSpeed,set:v=>carrierSpeed=v},{id:'bias',label:'Half wheel-speed difference (rad/s)',type:'range',min:-1.2,max:1.2,step:.05,get:()=>bias,set:v=>bias=v},{id:'open',label:'Open the carrier shell',type:'range',min:0,max:1,step:.01,get:()=>opened,set:v=>opened=v},{id:'locked',label:'Hold the left axle · right runs at 2×',type:'button',set:()=>bias=-carrierSpeed}],stats:()=>{const s=differentialSpeeds(carrierSpeed,bias);return[{label:'Left ω',value:s.left.toFixed(2)+' rad/s'},{label:'Carrier ω',value:s.carrier.toFixed(2)+' rad/s'},{label:'Right ω',value:s.right.toFixed(2)+' rad/s'}];},views:{overview:{position:[3.8,2.8,7.4],target:[0,-.2,0]},detail:{position:[2,1.5,4.5],target:[0,0,0]}},note:'An equal-side-gear kinematic differential: ωc=(ωL+ωR)/2. Angles integrate velocities, so changing speed does not teleport the mechanism. Side/pinion tooth-count ratio is 24:12. Bevel teeth, carrier openings and clearances are illustrative; this does not solve conjugate tooth contact, loads, torque distribution or manufacturing geometry.',sources:[{title:'MIT 2.972 — How a Differential Works',url:'https://web.mit.edu/2.972/www/reports/differential/differential.html'}]});
}
