import {THREE,mat,mesh,tube,line,label} from '../scene-kit.js';
import {study,parametric,TAU} from '../study-kit.js';
import {loadAnatomy,anatomySources,anatomyCredit} from '../anatomy-assets.js';
import {addMorphPoses} from '../anatomy-motion.js';
import {advanceCycle,breathingCycle,lungPose} from '../body-motion.js';
const FRAME=['FMA7486','FMA7487','FMA13322','FMA13323','FMA7857','FMA7987','FMA7882','FMA8012','FMA7909','FMA8039','FMA7957','FMA8148'];
const PARTS=['FMA7333','FMA7337','FMA7370','FMA7371','FMA7383','FMA7394'];
export async function createScene(){
 const {group,objects}=await loadAnatomy([...PARTS,...FRAME],{center:[0,-105,1260],scale:.013,material:(id,name)=>FRAME.includes(id)?mat('#ddd0b4',.66):new THREE.MeshPhysicalMaterial({color:/trachea/.test(name)?'#c5af8c':['FMA7333','FMA7337','FMA7383'].includes(id)?'#bf8299':'#a67d9e',roughness:.56,clearcoat:.08,transparent:true,opacity:1,side:THREE.DoubleSide})});
 const lungs=objects.filter(o=>PARTS.includes(o.userData.id)&&o.userData.id!=='FMA7394');for(const o of lungs)addMorphPoses(o,[lungPose]);
 const frame=objects.filter(o=>FRAME.includes(o.userData.id));
 let frameVisible=false;
 let phase=.1,rate=10,playing=true,transparent=false,section=false,pose=breathingCycle(phase);
 const clips=[new THREE.Plane(new THREE.Vector3(0,0,-1),.7)];
 const airway=new THREE.Group();group.add(airway);const gold=mat('#c6ad7b',.5),arrows=[];
 // These bronchi and direction arrows are schematic; they do not claim a measured airway tree.
 for(const side of [-1,1]){const path=[[0,1.03,.08],[0,.68,.02],[side*.45,.45,-.05],[side*.75,.1,-.2]];tube(path,.065,gold,airway,30);
  for(let i=0;i<3;i++){
   const root=[side*.45,.45,-.05],fork=[side*(.65+i*.1),.3-i*.22,-.1],tip=[side*(1+i*.06),.4-i*.48,-.18];
   tube([root,fork,tip],.028,gold,airway,24);
   for(const branch of [-1,1]){
    const end=[tip[0]+side*.15,tip[1]+branch*.17,tip[2]+branch*.17];tube([fork,tip,end],.013,gold,airway,16);
    for(const twig of [-1,1])tube([tip,end,[end[0]+side*.1,end[1]+twig*.08,end[2]+twig*.12]],.006,gold,airway,12);
   }
  }
  const curve=new THREE.CatmullRomCurve3(path.map(p=>new THREE.Vector3(...p)));
  for(let i=0;i<3;i++){const arrow=new THREE.ArrowHelper(new THREE.Vector3(0,-1,0),new THREE.Vector3(),.15,'#e0ebc5',.075,.045);airway.add(arrow);arrows.push({arrow,curve,offset:i/3});}
 }
 const diaGeometry=parametric((u,v)=>{const a=u*TAU,r=v;return[1.66*r*Math.cos(a),-1.8+.45*(1-r*r)+.012*Math.sin(a*26)*r,1.14*r*Math.sin(a)];},96,24);
 const dia=mesh(diaGeometry,mat('#889f99',.6,0,{side:THREE.DoubleSide,vertexColors:true}),[0,0,0],group);
 const colors=new Float32Array(diaGeometry.attributes.position.count*3),flesh=new THREE.Color('#99b3a4'),tendon=new THREE.Color('#e0d7b5');
 for(let i=0;i<diaGeometry.attributes.position.count;i++){const p=diaGeometry.attributes.position,r=Math.hypot(p.getX(i)/1.66,p.getZ(i)/1.14);const a=Math.atan2(p.getZ(i)/1.14,p.getX(i)/1.66);flesh.clone().multiplyScalar(.9+.1*Math.cos(a*84)).lerp(tendon,Math.max(0,1-r*2.7)).toArray(colors,i*3);}diaGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 addMorphPoses(dia,[(x,y,z)=>{const r2=(x/1.66)**2+(z/1.14)**2;return[x*1.05,y-.2-.28*(1-r2),z*1.05];}]);
 const envelope=new THREE.Group();group.add(envelope);for(let i=0;i<6;i++){const y=-1.35+i*.52,rx=1.78-.2*Math.abs(y);line(Array.from({length:100},(_,j)=>{const a=.1+j/99*(TAU-.2);return[rx*Math.cos(a),y,1.2*Math.sin(a)];}),'#a4b7b2',envelope,.3);}
 label('DIAPHRAGM · SCHEMATIC',[0,-2.23,1],'#a9ccc0',.12,group);
 function update(dt){phase=advanceCycle(phase,dt,rate,playing);pose=breathingCycle(phase);const e=pose.expansion;frame.forEach(o=>o.visible=frameVisible);
  lungs.forEach(o=>{o.morphTargetInfluences[0]=e;o.material.opacity=transparent?.2:1;o.material.depthWrite=!transparent;o.material.clippingPlanes=section?clips:[];});
  dia.morphTargetInfluences[0]=e;envelope.scale.set(1+.09*e,1+.015*e,1+.085*e);envelope.position.y=.055*e;
  airway.visible=transparent||section;airway.scale.set(1+.075*e,1,1+.07*e);
  for(const {arrow,curve,offset} of arrows){const u=(phase*3+offset)%1,travel=pose.inhaling?u:1-u;arrow.position.copy(curve.getPoint(travel));arrow.setDirection(curve.getTangent(travel).multiplyScalar(pose.inhaling?1:-1));arrow.visible=e>.025&&e<.975;}
 }
 const reset=()=>{frameVisible=false;phase=.1;rate=10;playing=true;transparent=section=false;update(0);};update(0);
 return study(group,{lighting:{exposure:.84,key:9,fill:2.5,rim:10},update,reset,needsAnimation:()=>playing,controls:[
  {id:'phase',label:'Breathing cycle · scrub to pause',type:'range',min:0,max:1,step:.01,get:()=>phase,set:v=>{phase=v;playing=false;}},
  {id:'play',label:'Breathing cycle',getLabel:()=>playing?'Pause the breathing cycle':'Play the breathing cycle',type:'button',set:()=>playing=!playing},
  {id:'rate',label:'Illustrative breaths per minute',type:'range',min:4,max:20,step:1,get:()=>rate,set:v=>rate=v},
  {id:'airways',label:'Reveal / hide airways and flow direction',type:'button',set:()=>transparent=!transparent},
  {id:'frame',label:'Show / hide upper rib reference',type:'button',set:()=>frameVisible=!frameVisible},
  {id:'section',label:'Open / close the anterior section',type:'button',set:()=>section=!section}
 ],stats:()=>[{label:'Phase',value:pose.stage},{label:'Diaphragm',value:pose.inhaling?'Descending · flattening':'Relaxing · doming'},{label:'Cycle rate',value:rate+' / min'}],views:{overview:{position:[3.3,1.7,9.3],target:[0,-.2,0]},detail:{position:[1.9,1,5.2],target:[0,0,0]}},note:'Five source lung lobes and a source trachea. One shared deformation field keeps the source lobe boundaries together while the diaphragm descends/flattens and the thoracic envelope expands. The optional first four rib pairs, sternum components and clavicles are registered source geometry held in the rest pose for spatial reference, not a moving chest-wall model. The envelope, diaphragm, bronchi and arrows are schematic. This authored cycle gives inspiration 40% and expiration 60% of display time; it is not measured respiratory timing. The lungs are passive: the motion illustrates thoracic expansion and elastic recoil, not lung muscle contraction. Pressure, airflow speed, gas exchange, compliance and tissue mechanics are not solved. Arrows show direction only.',craft:anatomyCredit,sources:[...anatomySources,{title:'OpenStax — Breathing mechanics, diaphragm and passive expiration',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/22-3-the-process-of-breathing'}]});
}
