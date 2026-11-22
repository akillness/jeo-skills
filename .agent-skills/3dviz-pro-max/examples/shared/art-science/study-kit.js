import {THREE,mat,mesh,line,label} from './scene-kit.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
export {THREE,mat,mesh,line,label};
export const TAU=Math.PI*2;
export function rounded(size,material,position,parent,r=.05){return mesh(new RoundedBoxGeometry(...size,3,r),material,position,parent);}
export function ring(radius,thickness,material,parent,position=[0,0,0]){return mesh(new THREE.TorusGeometry(radius,thickness,10,128),material,position,parent);}
export function curvePoints(fn,count=128){return Array.from({length:count+1},(_,i)=>fn(i/count));}
export function dynamicLine(count,color,parent,opacity=1){
 const p=new Float32Array(count*3),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(p,3));
 const o=new THREE.Line(g,new THREE.LineBasicMaterial({color,opacity,transparent:opacity<1}));o.frustumCulled=false;parent.add(o);
 o.setPoints=points=>{for(let i=0;i<points.length;i++)p.set(points[i].isVector3?points[i].toArray():points[i],i*3);g.setDrawRange(0,points.length);g.attributes.position.needsUpdate=true;};return o;
}
export function parametric(fn,nu=128,nv=32){
 const p=[],uv=[],ix=[];for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){p.push(...fn(i/nu,j/nv));uv.push(i/nu,j/nv);}
 for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const a=i*(nv+1)+j,b=a+nv+1;ix.push(a,b,a+1,b,b+1,a+1);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(ix);g.computeVertexNormals();return g;
}
export function strand(points,radius,material,parent,endRadius=.006){
 const c=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),frames=c.computeFrenetFrames(40,false);
 const g=parametric((u,v)=>{const i=Math.min(40,Math.round(u*40)),p=c.getPoint(u),r=radius*(1-u)+endRadius*u,a=v*TAU;return p.addScaledVector(frames.normals[i],r*Math.cos(a)).addScaledVector(frames.binormals[i],r*Math.sin(a)).toArray();},40,10);
 return mesh(g,material,[0,0,0],parent);
}
export function setSegment(o,a,b){const p=new THREE.Vector3(...a),d=new THREE.Vector3(...b).sub(p);o.position.copy(p).addScaledVector(d,.5);o.scale.y=d.length();o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
export function fiberTexture(color='#a75a63',seed=17){
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,256,256);
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<220;i++){const y=rand()*256;ctx.strokeStyle=`rgba(${i%3?240:48},${i%3?189:20},${i%3?170:28},${.06+rand()*.13})`;ctx.lineWidth=.3+rand();ctx.beginPath();ctx.moveTo(0,y);ctx.bezierCurveTo(80,y+rand()*8,170,y-rand()*8,256,y+rand()*6);ctx.stroke();}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
export function instrumentBase(group,width=5,depth=2.7,y=-1.8){
 const dark=mat('#14292f',.4,.55),brass=mat('#b69865',.3,.73);
 rounded([width,.2,depth],dark,[0,y,0],group,.09);rounded([width-.12,.018,depth-.12],brass,[0,y+.107,0],group,.045);
 rounded([width-.22,.018,depth-.22],dark,[0,y+.12,0],group,.04);
 for(const x of [-1,1])for(const z of [-1,1])mesh(new THREE.CylinderGeometry(.13,.15,.16,24),brass,[x*(width/2-.3),y-.15,z*(depth/2-.3)],group);
 return{dark,brass};
}
export function study(group,options){
 return {group,stage:false,needsAnimation:()=>false,update(){},lighting:{exposure:1,key:10,fill:4,rim:10},
 views:{overview:{position:[4,2.3,8],target:[0,0,0]},detail:{position:[2,1,4.6],target:[0,0,0]}},...options};
}
