import {THREE,mat,mesh,sphere,line,label,tube} from '../scene-kit.js';
import {study,ring,TAU} from '../study-kit.js';
import {keplerPosition} from './physics-models.js';
const PLANETS=[{id:'mercury',name:'Mercury',a:.387099,e:.205636,p:87.969,r:.075,c:'#b5aa95'},{id:'venus',name:'Venus',a:.723336,e:.00678,p:224.701,r:.11,c:'#dac29b'},{id:'earth',name:'Earth',a:1.000003,e:.016711,p:365.256,r:.12,c:'#7dabb0'},{id:'mars',name:'Mars',a:1.52371,e:.093394,p:686.98,r:.095,c:'#c18a70'}];
export function createScene(){
 const group=new THREE.Group(),brass=mat('#bf9b60',.28,.72),dark=mat('#172930',.45,.55),bodies=[],arms=[];let days=0,rate=32,selected='earth',sweep=true;
 const profile=[[0,-1.35],[.45,-1.35],[.6,-1.25],[.55,-1.1],[.25,-1.02],[.18,-.7],[.22,-.48],[.16,-.36],[.16,.15],[0,.15]].map(p=>new THREE.Vector2(...p));mesh(new THREE.LatheGeometry(profile,80),brass,[0,0,0],group);
 mesh(new THREE.CylinderGeometry(.45,.45,.075,64),brass,[0,-1.3875,0],group);
 mesh(new THREE.CylinderGeometry(2.6,2.65,.16,128),dark,[0,-1.5,0],group);for(const r of [2.4,2.53,2.64])ring(r,.009,brass,group,[0,-1.41,0]).rotation.x=-Math.PI/2;
 for(let i=0;i<120;i++){const a=i/120*TAU;line([[2.42*Math.cos(a),-1.4,2.42*Math.sin(a)],[(i%10?2.49:2.56)*Math.cos(a),-1.4,(i%10?2.49:2.56)*Math.sin(a)]],'#c1a16e',group,.65);}
 const sunMat=new THREE.MeshPhysicalMaterial({color:'#dfb56a',roughness:.43,emissive:'#a75f16',emissiveIntensity:.5});sphere([0,.35,0],.23,sunMat,group);
 for(const [i,p] of PLANETS.entries()){const scale=1.45,pts=Array.from({length:241},(_,k)=>{const E=k/240*TAU;return[scale*p.a*(Math.cos(E)-p.e),.35,scale*p.a*Math.sqrt(1-p.e*p.e)*Math.sin(E)];});tube(pts,.007,brass,group,240,true);
  const body=new THREE.Group();group.add(body);const s=sphere([0,0,0],p.r,mat(p.c,.65,.1),body);for(let j=1;j<5;j++){const a=j/5*Math.PI;const r=p.r*Math.sin(a);const band=ring(r,.0025,brass,body,[0,p.r*Math.cos(a),0]);band.rotation.x=Math.PI/2;}bodies.push(body);
  const arm=mesh(new THREE.CylinderGeometry(.012,.012,1,12),brass,[0,0,0],group);arms.push(arm);
  for(const r of [.21+i*.045,.225+i*.045])ring(r,.009,brass,group,[0,-.65+i*.11,0]).rotation.x=-Math.PI/2;
 }
 const sectorG=new THREE.BufferGeometry(),sector=new THREE.Mesh(sectorG,new THREE.MeshBasicMaterial({color:'#c0a46c',transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));group.add(sector);
 function position(p,d){return keplerPosition({semiMajor:p.a,eccentricity:p.e,meanAnomaly:.7+TAU*d/p.p});}
 function update(dt){days+=dt*rate;PLANETS.forEach((p,i)=>{const q=position(p,days),end=new THREE.Vector3(q.x*1.45,.35,q.y*1.45);bodies[i].position.copy(end);const start=new THREE.Vector3(0,-.65+i*.11,0),d=end.clone().sub(start);arms[i].position.copy(start).addScaledVector(d,.5);arms[i].scale.y=d.length();arms[i].quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());bodies[i].scale.setScalar(p.id===selected?1.2:1);});
  const p=PLANETS.find(p=>p.id===selected),points=[];for(let i=0;i<=45;i++){const q=position(p,days-i/45*20);points.push(q.x*1.45,.355,q.y*1.45);}const vertices=[];for(let i=0;i<45;i++)vertices.push(0,.355,0,...points.slice(i*3,i*3+3),...points.slice((i+1)*3,(i+1)*3+3));
  if(!sectorG.attributes.position)sectorG.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));else{sectorG.attributes.position.array.set(vertices);sectorG.attributes.position.needsUpdate=true;}sector.frustumCulled=false;sector.visible=sweep;
 }
 const reset=()=>{days=0;rate=32;selected='earth';sweep=true;update(0);};update(0);
 return study(group,{update,reset,needsAnimation:()=>rate!==0,controls:[{id:'rate',label:'Model days per second',type:'range',min:0,max:120,step:1,get:()=>rate,set:v=>rate=v},{id:'planet',label:'Inspect an orbit',type:'select',options:PLANETS.map(p=>({value:p.id,label:p.name})),get:()=>selected,set:v=>selected=v},{id:'sweep',label:'Show / hide the 20-day swept area',type:'button',set:()=>sweep=!sweep},{id:'perihelion',label:'Place selected planet at perihelion',type:'button',set:()=>{const p=PLANETS.find(p=>p.id===selected);days=-.7*p.p/TAU;rate=0;}}],stats:()=>{const p=PLANETS.find(p=>p.id===selected),q=position(p,days);return[{label:'Selected orbit',value:p.name},{label:'Distance to Sun',value:Math.hypot(q.x,q.y).toFixed(4)+' AU'},{label:'Period',value:p.p.toFixed(2)+' days'}];},views:{overview:{position:[4.1,4.8,7.2],target:[0,-.45,0]},detail:{position:[2.3,2.8,3.8],target:[0,.2,0]}},note:'Independent coplanar Kepler ellipses with fixed representative orbital elements. All orbit distances share one linear display scale; planet sizes are enlarged. Initial phases are authored, not an ephemeris. The selected sector covers 20 model days, illustrating equal swept areas over equal times. Brass supports are a visual instrument, not a mechanically solved clockwork.',sources:[{title:'NASA/JPL — Approximate planetary positions and Kepler equation',url:'https://ssd.jpl.nasa.gov/planets/approx_pos.html'}]});
}
