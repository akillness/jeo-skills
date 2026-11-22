import {THREE,mesh,disposeGroup} from './scene-kit.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {ASSET_BASE} from '../asset-base.js';
export const anatomySources=[{title:'BodyParts3D — source geometry and attribution',url:'https://github.com/Kevin-Mattheus-Moerman/BodyParts3D'},{title:'CC BY-SA 2.1 Japan',url:'https://creativecommons.org/licenses/by-sa/2.1/jp/'}];
export const anatomyCredit='BodyParts3D, © The Database Center for Life Science, CC BY-SA 2.1 Japan via the Kevin Moerman STL mirror. Source-coordinate registration is retained; display materials, scale, clipping and separated-part views are adaptations. These are selected structures from one reference model, not patient-specific anatomy.';
// Every standalone page is one directory below the examples app root, so the default relative
// base resolves to /assets/; VITE_ASSET_BASE swaps in the hosted bucket. See shared/asset-base.js.
const ASSET_ROOT=ASSET_BASE+'anatomy/';
export async function loadAnatomy(ids,{center,scale,material}){
 const group=new THREE.Group(),objects=[],loader=new STLLoader();const response=await fetch(`${ASSET_ROOT}attribution.json`);if(!response.ok)throw new Error('Anatomy attribution unavailable');const metadata=await response.json();
 try{for(let start=0;start<ids.length;start+=3){const results=await Promise.allSettled(ids.slice(start,start+3).map(async id=>{
  const r=await fetch(`${ASSET_ROOT}${id}.stl`);if(!r.ok)throw new Error(`Anatomy asset unavailable: ${id}`);
  let g=loader.parse(await r.arrayBuffer());g.deleteAttribute('normal');const a=g.attributes.position;
  for(let i=0;i<a.count;i++){const x=a.getX(i),y=a.getY(i),z=a.getZ(i);a.setXYZ(i,(x-center[0])*scale,(z-center[2])*scale,-(y-center[1])*scale);}
  const merged=mergeVertices(g,1e-4);g.dispose();g=merged;g.computeVertexNormals();const p=g.attributes.position,uv=new Float32Array(p.count*2);
  for(let i=0;i<p.count;i++){uv[i*2]=p.getY(i)*.8;uv[i*2+1]=p.getX(i)*.7+p.getZ(i)*.2;}g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  const entry=metadata.parts[id],m=material(id,entry.name);m.clipShadows=true;const o=mesh(g,m,[0,0,0],group);o.userData={id,name:entry.name};g.computeBoundingBox();o.userData.center=g.boundingBox.getCenter(new THREE.Vector3());return o;
 }));const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;objects.push(...results.map(r=>r.value));}}
 catch(error){disposeGroup(group);throw error;}
 return{group,objects,metadata};
}
