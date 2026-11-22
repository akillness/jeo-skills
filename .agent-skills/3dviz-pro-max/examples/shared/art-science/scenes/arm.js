import {THREE,mat,label} from '../scene-kit.js';
import {study,fiberTexture} from '../study-kit.js';
import {loadAnatomy,anatomySources,anatomyCredit} from '../anatomy-assets.js';
import {rigArmMuscles} from '../anatomy-motion.js';
import {armCycle,advanceCycle,TAU,clamp} from '../body-motion.js';
const BONES=['FMA23130','FMA23464','FMA23467','FMA13322','FMA13395'],MUSCLES=['FMA37684','FMA37686','FMA37695','FMA37697','FMA37699'];
export async function createScene(){
 const fiber=fiberTexture('#c49c87'),{group,objects}=await loadAnatomy([...BONES,...MUSCLES],{center:[-207,-78,1090],scale:.009,material:id=>BONES.includes(id)?mat('#cbbb9c',.63):new THREE.MeshPhysicalMaterial({color:'#d7a48e',map:fiber,bumpMap:fiber,bumpScale:.009,roughness:.57,clearcoat:.08,side:THREE.DoubleSide})});
 const forearm=new THREE.Group();forearm.position.set(-.054,-.351,-.108);group.add(forearm);
 for(const o of objects)if(['FMA23464','FMA23467'].includes(o.userData.id)){o.geometry.translate(-forearm.position.x,-forearm.position.y,-forearm.position.z);forearm.add(o);}
 const rig=rigArmMuscles(group,objects.filter(o=>MUSCLES.includes(o.userData.id)),forearm.position);
 let phase=.15,playing=true,rate=7,opacity=1,separation=0,annotationsOn=false,pose=armCycle(phase);
 const annotations=new THREE.Group();group.add(annotations);label('HUMERUS',[.9,1.9,0],'#d8c4a5',.13,annotations);label('BICEPS',[-.9,1,.6],'#d6a993',.13,annotations);label('TRICEPS',[.8,.6,-.8],'#bc9db3',.13,annotations);
 function update(dt){phase=advanceCycle(phase,dt,rate,playing);pose=armCycle(phase);const radians=-pose.angle*Math.PI/180;
  forearm.rotation.x=rig.elbow.rotation.x=radians;
  for(const {o,biceps} of rig.muscles){if(o.morphTargetInfluences){o.morphTargetInfluences[0]=biceps?pose.flex:0;o.morphTargetInfluences[1]=biceps?0:pose.flex;}
   const transparent=opacity<1;if(o.material.transparent!==transparent){o.material.transparent=transparent;o.material.needsUpdate=true;}o.material.opacity=opacity;o.material.depthWrite=opacity>=.8;
   o.position.x=(biceps?-1:1)*separation*.45;
  }annotations.visible=annotationsOn;
 }
 const reset=()=>{phase=.15;playing=true;rate=7;opacity=1;separation=0;annotationsOn=false;update(0);};update(0);
 return study(group,{lighting:{exposure:.84,key:9,fill:2.5,rim:10},update,reset,dispose:rig.dispose,needsAnimation:()=>playing,controls:[
  {id:'angle',label:'Elbow flexion · scrub to pause (degrees)',type:'range',min:0,max:80,step:1,get:()=>pose.angle,set:v=>{phase=Math.acos(1-2*clamp(v/80))/TAU;playing=false;}},
  {id:'play',label:'Muscle contraction',getLabel:()=>playing?'Pause muscle contraction':'Play muscle contraction',type:'button',set:()=>playing=!playing},
  {id:'rate',label:'Movement cycles per minute',type:'range',min:3,max:12,step:1,get:()=>rate,set:v=>rate=v},
  {id:'opacity',label:'Muscle visibility',type:'range',min:.12,max:1,step:.02,get:()=>opacity,set:v=>opacity=v},
  {id:'separation',label:'Separate the muscle groups',type:'range',min:0,max:1,step:.01,get:()=>separation,set:v=>separation=v},
  {id:'labels',label:'Show / hide anatomical labels',type:'button',set:()=>annotationsOn=!annotationsOn}
 ],stats:()=>[{label:'Movement',value:playing?pose.stage:'Pose held'},{label:'Elbow angle',value:pose.angle.toFixed(0)+'°'},{label:'Muscle relationship',value:!playing?'Opposing length changes':pose.stage==='Flexion'?'Biceps shortens · triceps lengthens':'Triceps shortens · biceps lengthens'}],views:{overview:{position:[7.5,1.2,7.8],target:[0,-.12,.35]},detail:{position:[4.1,.6,3.8],target:[0,.15,.4]}},note:'Five source bones, including a stationary clavicle and scapula, and five selected biceps/triceps heads. A GPU skin rig follows an approximate elbow hinge; tapered corrective shapes illustrate biceps shortening/bulging and opposing superficial triceps length change. The deep medial triceps belly retains its source shape to avoid pushing its closely fitting inner surface into the humerus; distal attachment skinning still applies. End-region coloring and surface striations are artistic cues, not segmented tendons or measured fascicles. Motion illustrates a prescribed flexion/extension cycle, not activation, force, muscle volume conservation or patient biomechanics. The shoulder frame is shown in its source rest pose; shoulder motion, hand and other arm muscles are omitted. Pause or scrub to inspect a pose.',craft:anatomyCredit,sources:[...anatomySources,{title:'OpenStax — Muscle interactions and muscle belly shape',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/11-1-interactions-of-skeletal-muscles-their-fascicle-arrangement-and-their-lever-systems'},{title:'OpenStax — Upper-limb muscles',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/11-5-muscles-of-the-pectoral-girdle-and-upper-limbs'}]});
}
