import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
export {THREE};
export const TAU=Math.PI*2;
export function material(color,roughness=.55,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness});}
export function add(parent,geometry,mat,p=[0,0,0],s){const m=new THREE.Mesh(geometry,mat);m.position.set(...p);if(s)m.scale.set(...s);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
export function box(g,m,p,s,r=.03){return add(g,new RoundedBoxGeometry(...s,2,Math.min(r,...s.map(v=>v*.2))),m,p);}
export function ell(g,m,p,s){return add(g,new THREE.SphereGeometry(1,24,16),m,p,s);}
export function rod(g,m,a,b,r=.025,r2=r){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),d=bv.clone().sub(av);const o=add(g,new THREE.CylinderGeometry(r2,r,d.length(),12),m,av.add(bv).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;}
export function curve(g,m,points,r=.025){return add(g,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),32,r,8,false),m);}
export function ring(g,m,p,r,t=.02){return add(g,new THREE.TorusGeometry(r,t,8,64),m,p);}
export function grain(kind){
 const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#aaa';x.fillRect(0,0,256,256);
 for(let i=0;i<520;i++){const v=105+(i*47%90);x.strokeStyle='rgb('+v+','+v+','+v+')';x.lineWidth=kind==='wood'?.5:1;
  x.beginPath();const a=i*73%256,b=i*131%256;x.moveTo(a,b);x.lineTo(kind==='wood'?a+3:a+2,kind==='wood'?b+35:b+2);x.stroke();}
 const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);return t;
}
export function palette(){
 const wood=material('#69432d',.76),stone=material('#87958c',.85),cream=material('#dbc9a8',.78),roof=material('#345b60',.49,.28),gold=material('#bb9256',.32,.75),iron=material('#263439',.4,.8),leaf=material('#688768',.8),glass=new THREE.MeshPhysicalMaterial({color:'#679599',roughness:.2,metalness:.15,transparent:true,opacity:.72,depthWrite:false,clearcoat:.6});
 glass.name='window-glass';wood.bumpMap=grain('wood');wood.bumpScale=.018;stone.bumpMap=grain('stone');stone.bumpScale=.014;glass.emissive.set('#2d5b60');glass.emissiveIntensity=.035;
 return {wood,stone,cream,roof,gold,iron,leaf,glass};
}
export function finish(subject,{motion,title,description,ground=true}={}){
 const group=new THREE.Group();subject.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(subject),size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());
 const scale=.36/Math.max(size.x,size.y,size.z);subject.scale.multiplyScalar(scale);subject.position.set(-center.x*scale,-b.min.y*scale,-center.z*scale);group.add(subject);
 if(ground){const bronze=material('#5c645d',.44,.5),base=material('#17282b',.5,.3);add(group,new THREE.CylinderGeometry(.235,.24,.012,96),base,[0,-.008,0]);const rim=ring(group,bronze,[0,-.001,0],.233,.001);rim.rotation.x=Math.PI/2;}
 return {group,subject,title,description,update:dt=>{if(dt<=0||!motion)return false;motion(dt);return true;},dispose(){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){materials.add(m);for(const k of ['map','bumpMap','roughnessMap'])if(m[k])textures.add(m[k]);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
 }};
}

// A tapered, cambered vane with a solid back; reusable for stylized feathers and leaf-like plates.
export function feather(parent,mat,p,length,width,angle=0){
 const group=new THREE.Group();group.position.set(...p);group.rotation.z=angle;parent.add(group);
 const positions=[],colors=[],uv=[],indices=[],color=new THREE.Color();const segments=16;
 for(let back=0;back<2;back++)for(let i=0;i<=segments;i++){
  const t=i/segments,w=width*Math.sin(Math.PI*t)**.65;
  for(const side of [-1,0,1]){
   uv.push((side+1)/2,t);
   positions.push(side*w*(side<0?.78:1),-length*t,.022*Math.sin(Math.PI*t)+(side===0?.008:0)-back*.009);
   color.setRGB(1,1,1).multiplyScalar(.8+.16*Math.sin(i*2.1)+(side===0?.12:0));colors.push(color.r,color.g,color.b);
  }
 }
 const stride=(segments+1)*3;
 for(let back=0;back<2;back++)for(let i=0;i<segments;i++)for(let j=0;j<2;j++){
  const a=back*stride+i*3+j,b=a+1,c=a+3,d=a+4;
  indices.push(...(back?[a,b,c,b,d,c]:[a,c,b,b,c,d]));
 }
 for(let i=0;i<segments;i++)for(const edge of [0,2]){const a=i*3+edge,b=a+3;indices.push(a,b,a+stride,b,b+stride,a+stride);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
 add(group,geometry,mat);curve(group,mat,[[0,0,.01],[0,-length*.5,.035],[0,-length*.94,.01]],Math.min(.003,width*.07));return group;
}
