import * as THREE from 'three';
export { THREE };
export function mat(color,roughness=.5,metalness=0,extra={}) {
 return new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
}
export function mesh(geometry,material,position=[0,0,0],parent=null) {
 const o=new THREE.Mesh(geometry,material);o.position.set(...position);o.castShadow=true;o.receiveShadow=true;parent?.add(o);return o;
}
export function sphere(position,radius,material,parent,scale=[1,1,1]) {
 const o=mesh(new THREE.SphereGeometry(radius,40,28),material,position,parent);o.scale.set(...scale);return o;
}
export function tube(points,radius,material,parent,segments=80,closed=false) {
 const curve=new THREE.CatmullRomCurve3(points.map(p=>p.isVector3?p:new THREE.Vector3(...p)),closed,'centripetal');
 return mesh(new THREE.TubeGeometry(curve,segments,radius,8,closed),material,[0,0,0],parent);
}
export function line(points,color,parent,opacity=1) {
 const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>p.isVector3?p:new THREE.Vector3(...p)));
 const o=new THREE.Line(g,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));parent?.add(o);return o;
}
export function cylinderBetween(a,b,radius,material,parent) {
 const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
 const o=mesh(new THREE.CylinderGeometry(radius,radius,delta.length(),20),material,start.clone().add(end).multiplyScalar(.5).toArray(),parent);
 o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return o;
}
export function label(text,position,color='#dce8ee',size=.15,parent) {
 if(typeof document==='undefined')return new THREE.Group();
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 ctx.font='500 32px system-ui';const width=Math.ceil(ctx.measureText(text).width+30);canvas.width=width;canvas.height=60;
 ctx.font='500 32px system-ui';ctx.fillStyle=color;ctx.textBaseline='middle';ctx.fillText(text,15,30);
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 const o=new THREE.Sprite(new THREE.SpriteMaterial({map,depthWrite:false,transparent:true}));o.position.set(...position);o.scale.set(size*width/60,size,1);parent?.add(o);return o;
}
export function disposeGroup(group) {
 const geometries=new Set(),materials=new Set(),textures=new Set();
 group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of [o.material].flat().filter(Boolean)){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});
 textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());group.removeFromParent();
}
