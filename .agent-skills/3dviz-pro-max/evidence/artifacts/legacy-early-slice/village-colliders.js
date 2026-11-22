import {THREE} from './scene-kit.js';
// Bounds come from the rendered transforms, including rotated roofs and their trim.
export function colliderFor(object,name='solid'){
 object.updateWorldMatrix(true,true);
 const bounds=new THREE.Box3().setFromObject(object);
 return {min:bounds.min.toArray(),max:bounds.max.toArray(),name};
}
export function meshColliders(object,name='solid'){
 const result=[];object.traverse(o=>{if(o.isMesh)result.push(colliderFor(o,name));});return result;
}
// Sample the actual animated model, then use a yaw-invariant horizontal envelope.
// A small pad covers extrema between samples. This includes tails, antlers and wings.
export function creatureEnvelope(creature){
 // Sample stride extrema at maximum speed independently of idle/wing gesture time.
 // Include neutral and extreme joint angles; the padding bounds sampling gaps.
 const bounds=new THREE.Box3();for(let i=0;i<240;i++)for(const phase of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
  creature.animate(i*.071,{phase,amplitude:1});creature.g.updateMatrixWorld(true);bounds.union(new THREE.Box3().setFromObject(creature.g));
 }
 creature.animate(0,{phase:0,amplitude:0});const radius=Math.hypot(Math.max(Math.abs(bounds.min.x),Math.abs(bounds.max.x)),Math.max(Math.abs(bounds.min.z),Math.abs(bounds.max.z)))+.04;
 const center=(bounds.min.y+bounds.max.y)/2;
 return {half:[radius,(bounds.max.y-bounds.min.y)/2+.04,radius],center,bottom:bounds.min.y-.04};
}
