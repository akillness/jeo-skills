import {THREE,mesh,line,label,disposeGroup} from '../scene-kit.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {proximalPulmonary} from './heart-surface.js';
import {addMorphPoses} from '../anatomy-motion.js';
import {advanceCycle,cardiacCycle,heartPose} from '../body-motion.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {ASSET_BASE} from '../../asset-base.js';
// Local copy under /assets/ by default; VITE_ASSET_BASE points this at the hosted bucket.
const BASE=ASSET_BASE+'heart/';
const PARTS=[
 ['FMA7274','Myocardium','wall'],['FMA3736','Ascending aorta','artery'],['FMA3768','Aortic arch','artery'],
 ['FMA3802','Right coronary artery','coronary'],['FMA3818','Right marginal branch','coronary'],
 ['FMA3862nsn','Anterior interventricular branch','coronary'],['FMA3895','Circumflex branch','coronary'],
 ['FMA4685','Left coronary stem','coronary'],['FMA4706','Coronary sinus','vein'],
 ['FMA4720','Superior vena cava','vein'],['FMA10951','Inferior vena cava','vein'],
 ['FMA7234','Tricuspid valve','valve'],['FMA7235','Mitral valve','valve'],['FMA7246','Pulmonary valve','valve'],
 ['FMA66326','Pulmonary arteries','pulmonary']
];
const CENTER=[21.4,-121.8,1260],SCALE=.024;
function texture(){
 const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d'),img=ctx.createImageData(512,512);let seed=77;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4,v=135+12*Math.sin(x*.077+Math.sin(y*.04)*2)+12*(random()-.5);img.data[i]=img.data[i+1]=img.data[i+2]=v;img.data[i+3]=255;}
 ctx.putImageData(img,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
function prepare(geometry){
 geometry.deleteAttribute('normal');const p=geometry.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);p.setXYZ(i,(x-CENTER[0])*SCALE,(z-CENTER[2])*SCALE,-(y-CENTER[1])*SCALE);}
 const g=mergeVertices(geometry,1e-4);geometry.dispose();g.computeVertexNormals();
 const points=g.attributes.position,uv=new Float32Array(points.count*2);
 for(let i=0;i<points.count;i++){uv[i*2]=points.getX(i)*.65+points.getZ(i)*.18;uv[i*2+1]=points.getY(i)*.65;}
 g.setAttribute('uv',new THREE.BufferAttribute(uv,2));return g;
}
export async function createScene(){
 const group=new THREE.Group(),heart=new THREE.Group();group.add(heart);
 const state={phase:0,rate:60,section:0,focus:'all',labels:false,motion:true};
 let pose=cardiacCycle(0);
 const heightClip=[new THREE.Plane(new THREE.Vector3(0,1,0),2.03),new THREE.Plane(new THREE.Vector3(0,-1,0),2.25)];
 const pulmonaryClip=[...heightClip,new THREE.Plane(new THREE.Vector3(1,0,0),1.48),new THREE.Plane(new THREE.Vector3(-1,0,0),1.56),new THREE.Plane(new THREE.Vector3(0,0,1),.75)];
 const sectionPlane=new THREE.Plane(new THREE.Vector3(0,0,-1),3);
 const valveSection=new THREE.Plane(new THREE.Vector3(0,0,-1),-.15);
 const grain=texture(),materials={
  wall:new THREE.MeshPhysicalMaterial({color:'#8c3545',roughness:.78,metalness:0,clearcoat:.05,clearcoatRoughness:.6,bumpMap:grain,bumpScale:.006,roughnessMap:grain,side:THREE.DoubleSide}),
  artery:new THREE.MeshPhysicalMaterial({color:'#b95154',roughness:.4,clearcoat:.18,bumpMap:grain,bumpScale:.008,side:THREE.DoubleSide}),
  pulmonary:new THREE.MeshPhysicalMaterial({color:'#5d8fa0',roughness:.38,clearcoat:.2,side:THREE.DoubleSide}),
  coronary:new THREE.MeshPhysicalMaterial({color:'#d3a26c',roughness:.32,metalness:.12,clearcoat:.15,side:THREE.DoubleSide}),
  vein:new THREE.MeshPhysicalMaterial({color:'#557e96',roughness:.4,clearcoat:.1,side:THREE.DoubleSide}),
  valve:new THREE.MeshPhysicalMaterial({color:'#d8b4a0',roughness:.54,side:THREE.DoubleSide})
 };
 const loader=new STLLoader(),objects=[];
 // Source-coordinate registration is retained across all parts; no part is independently centered.
 try{for(let start=0;start<PARTS.length;start+=3){
  const batch=await Promise.allSettled(PARTS.slice(start,start+3).map(async([id,name,type])=>{
   const response=await fetch(BASE+id+'.stl');if(!response.ok)throw new Error(`Missing anatomy asset ${id}`);
   const g=prepare(loader.parse(await response.arrayBuffer()));
   try{if(type==='pulmonary')proximalPulmonary(g);}catch(error){g.dispose();throw error;}
   const material=materials[type].clone();material.clipShadows=true;
   material.clippingPlanes=type==='wall'?[...heightClip,sectionPlane]:type==='pulmonary'?pulmonaryClip:heightClip;
   const object=mesh(g,material,[0,0,0],heart);object.userData={id,name,type};
   addMorphPoses(object,[(x,y,z)=>heartPose(x,y,z,'atrial'),(x,y,z)=>heartPose(x,y,z,'ventricular')]);return object;
  }));
  const failure=batch.find(result=>result.status==='rejected');
  if(failure)throw failure.reason;
  objects.push(...batch.map(result=>result.value));
 }}catch(error){disposeGroup(group);grain.dispose();throw error;}
 finally{Object.values(materials).forEach(m=>m.dispose());}
 const annotations=new THREE.Group();group.add(annotations);
 const marks=[['AORTIC ARCH',[.05,1.52,.4],[1.5,1.9,.3]],['CORONARY NETWORK',[.18,-.32,1.06],[1.8,-.4,.45]],['MYOCARDIUM',[.3,-1.16,.95],[-1.75,-1.4,.55]]];
 for(const [text,anchor,end] of marks){const callout=new THREE.Group();callout.userData={family:text==='MYOCARDIUM'?'wall':text==='CORONARY NETWORK'?'coronary':'artery',anchor:new THREE.Vector3(...anchor)};annotations.add(callout);line([anchor,end],'#ac8e7f',callout,.5);label(text,end,'#d8c1ab',.105,callout);}
 const guide=new THREE.Group();group.add(guide);
 const orbit=Array.from({length:121},(_,i)=>{const a=i/120*Math.PI*2;return[2.35*Math.cos(a),-2.14,1.45*Math.sin(a)];});line(orbit,'#aa8d73',guide,.17);
 // A cut surface uses the real wall mesh, never separate floating chamber placeholders.
 function refresh(){
  sectionPlane.constant=state.section===0?3:1.34-state.section*1.72;valveSection.constant=-.15-state.section*.8;annotations.visible=state.labels;
  syncAnnotations();
  for(const o of objects){const selected=state.focus==='all'||o.userData.type===state.focus;
   o.visible=selected||state.focus==='valve'&&o.userData.type==='wall';
   if(o.userData.type==='wall'&&state.focus==='valve')o.material.clippingPlanes=[...heightClip,valveSection];
   else if(o.userData.type==='wall'||o.userData.type==='coronary'||o.userData.type==='vein')o.material.clippingPlanes=[...heightClip,sectionPlane];
  }
 }
 function syncAnnotations(){
  for(const c of annotations.children){
   const a=c.userData.anchor,atrial=heartPose(a.x,a.y,a.z,'atrial'),ventricular=heartPose(a.x,a.y,a.z,'ventricular');
   c.position.set((atrial[0]-a.x)*pose.atrial+(ventricular[0]-a.x)*pose.ventricular,
    (atrial[1]-a.y)*pose.atrial+(ventricular[1]-a.y)*pose.ventricular,
    (atrial[2]-a.z)*pose.atrial+(ventricular[2]-a.z)*pose.ventricular);
   const displayed=a.clone().add(c.position);
   c.visible=(state.focus==='all'||state.focus===c.userData.family)&&(c.userData.family==='artery'||sectionPlane.distanceToPoint(displayed)>=0);
  }
 }
 function update(dt){
  state.phase=advanceCycle(state.phase,dt,state.rate,state.motion);pose=cardiacCycle(state.phase);
  // All registered parts share the same spatial corrective fields, including the coronary surface.
  for(const o of objects){o.morphTargetInfluences[0]=pose.atrial;o.morphTargetInfluences[1]=pose.ventricular;}
  if(state.labels)syncAnnotations();
 }
 function reset(){Object.assign(state,{phase:0,rate:60,section:0,focus:'all',labels:false,motion:true});refresh();update(0);}
 refresh();update(0);
 return {group,update,reset,stage:false,lighting:{exposure:.96,key:9,fill:3,rim:9},needsAnimation:()=>state.motion,
  views:{overview:{position:[2.2,1.0,8.2],target:[-.4,.1,0]},detail:{position:[1.2,.2,3.65],target:[.05,-.35,.2]}},
  controls:[
   {id:'heart-focus',label:'Explore the structure',type:'select',options:[{value:'all',label:'Assembled anatomy'},{value:'wall',label:'Myocardial wall'},{value:'coronary',label:'Coronary arteries'},{value:'valve',label:'Internal valves'}],get:()=>state.focus,set:v=>{state.focus=v;refresh();}},
   {id:'heart-section',label:'Open the anterior section',type:'range',min:0,max:1,step:.01,get:()=>state.section,set:v=>{state.section=v;refresh();}},
   {id:'heart-phase',label:'Cardiac cycle · scrub to pause',type:'range',min:0,max:1,step:.01,get:()=>state.phase,set:v=>{state.phase=v;state.motion=false;}},
   {id:'heart-motion',label:'Heartbeat',getLabel:()=>state.motion?'Pause the heartbeat':'Play the heartbeat',type:'button',set:()=>{state.motion=!state.motion;}},
   {id:'heart-rate',label:'Illustrative beats / minute',type:'range',min:35,max:100,step:1,get:()=>state.rate,set:v=>state.rate=v},
   {id:'heart-labels',label:'Show / hide anatomical annotations',type:'button',set:()=>{state.labels=!state.labels;refresh();}}
  ],stats:()=>[{label:'Anatomical structures',value:'15 registered parts'},{label:'Cardiac phase',value:pose.stage},{label:'Surface',value:state.focus==='valve'?'Valve inspection cut':state.section>0?'Anterior section':'Intact wall'}],
  note:'Source-derived BodyParts3D anatomy, not a patient scan or a calibrated cardiac simulation. Registered parts retain their relative coordinates; the display is enlarged 24 times when scene units are read as metres. Arterial trees and vena cava are cropped. This selected assembly includes three valve meshes; aortic valve and separate papillary muscles are not included. Cutaways reveal the source wall geometry, with open clipping boundaries; no chamber or pressure measurements are inferred. The heartbeat starts automatically, with phase scrubbing and pause. Shared regional corrective shapes illustrate atrial contraction followed by ventricular contraction and relaxation; their amplitudes, spatial regions and timing fractions are authored, not measured chamber mechanics. No valve opening/closing, blood-flow, ejection-fraction or pressure simulation is implied.',
  craft:'External anatomical geometry with custom real-time materials and lighting. BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 Japan through the Kevin Moerman STL mirror. Display rotation, scale, clipping, texture and illustrative pulse are adaptations. No Blender-baked T3 result is claimed.',
  sources:[{title:'BodyParts3D — Mitsuhashi et al., 2009',url:'https://pmc.ncbi.nlm.nih.gov/articles/PMC2686534/'},{title:'Geometry source and attribution',url:'https://github.com/Kevin-Mattheus-Moerman/BodyParts3D'},{title:'CC Attribution-ShareAlike 2.1 Japan',url:'https://creativecommons.org/licenses/by-sa/2.1/jp/'},{title:'Cardiac cycle — OpenStax',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/19-3-cardiac-cycle'},{title:'Heart anatomy — OpenStax',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/19-1-heart-anatomy'}]
 };
}
