import {THREE,TAU,add,ell,rod,ring,material,finish} from './craft-forms.js';
import {makeLabel} from './label-sprite.js';
// Bloch coordinates map to world (x,z,-y), preserving a right-handed frame.
// Source: IBM Quantum Learning, Density matrices / Bloch sphere.
export function blochPoint(theta,phi,r=1){return [r*Math.sin(theta)*Math.cos(phi),r*Math.cos(theta),-r*Math.sin(theta)*Math.sin(phi)];}
export function craftedBloch(){
 const g=new THREE.Group(),gold=material('#d1a467',.27,.75),teal=material('#6aaea9',.28,.35),ink=material('#869ea3',.4,.5),labels=[];
 const shell=add(g,new THREE.SphereGeometry(1,64,48),new THREE.MeshBasicMaterial({color:'#7fc7c5',transparent:true,opacity:.035,depthWrite:false}));
 for(let i=0;i<3;i++){const r=ring(g,i===0?gold:ink,[0,0,0],1,.006);if(i===0)r.rotation.x=Math.PI/2;if(i===2)r.rotation.y=Math.PI/2;}
 for(let lat=1;lat<6;lat++){const a=lat*Math.PI/6,r=ring(g,ink,[0,Math.cos(a),0],Math.sin(a),.002);r.rotation.x=Math.PI/2;}
 for(const [p,text] of [[[1.24,0,0],'+x'],[[0,0,-1.24],'+y'],[[0,1.24,0],'+z |0〉'],[[0,-1.24,0],'-z |1〉']]){
  rod(g,ink,[0,0,0],p,.005);const label=makeLabel(text,{color:'#c5d6d3',height:.085});label.position.set(...p.map(v=>v*1.08));g.add(label);labels.push(label);
 }
 for(let i=0;i<72;i++){const a=i/72*TAU;rod(g,gold,[Math.cos(a),0,Math.sin(a)],[Math.cos(a)*(i%6?1.018:1.04),0,Math.sin(a)*(i%6?1.018:1.04)],.002);}
 let theta=55*Math.PI/180,phi=35*Math.PI/180,auto=false;
 const arrow=new THREE.Group();g.add(arrow);rod(arrow,teal,[0,0,0],[0,.91,0],.015);add(arrow,new THREE.ConeGeometry(.038,.1,24),gold,[0,.95,0]);
 const tip=ell(g,teal,[0,0,0],[.038,.038,.038]);
 function pose(){const p=new THREE.Vector3(...blochPoint(theta,phi));tip.position.copy(p);arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),p);}
 pose();const result=finish(g,{ground:false,title:'The Qubit Compass',description:'A pure-state Bloch sphere. Teal marks the state vector; brass marks the equator. Change θ and φ to move the state on the unit sphere. This is state space, not a physical orbit.'});
 result.update=dt=>{if(!auto||dt<=0)return false;phi=(phi+dt*.22)%TAU;pose();result.sync?.();return true;};
 result.bind=(panel,invalidate)=>{
  const probability=document.createElement('p');probability.className='fine';
  const inputs=[];
  for(const [name,max,get,set] of [['Polar angle θ (degrees)',180,()=>theta,v=>theta=v],['Azimuth φ (degrees)',360,()=>phi,v=>phi=v]]){
   const label=document.createElement('label');label.textContent=name;const input=document.createElement('input');input.type='range';input.min=0;input.max=max;input.step=1;input.setAttribute('aria-label',name);input.value=get()*180/Math.PI;label.append(input);panel.append(label);inputs.push({input,get});
   input.oninput=()=>{auto=false;set(Number(input.value)*Math.PI/180);pose();sync();invalidate();};
  }
  const rotate=document.createElement('button');rotate.type='button';panel.append(rotate,probability);
  const source=document.createElement('a');source.href='https://quantum.cloud.ibm.com/learning/en/courses/general-formulation-of-quantum-information/density-matrices/bloch-sphere';source.textContent='Source · IBM Quantum';source.target='_blank';source.rel='noopener noreferrer';panel.append(source);
  function sync(){inputs.forEach(({input,get})=>input.value=get()*180/Math.PI);rotate.textContent=auto?'Stop azimuth sweep':'Animate azimuth sweep';probability.textContent='P(0) = '+((1+Math.cos(theta))/2).toFixed(3)+' · P(1) = '+((1-Math.cos(theta))/2).toFixed(3)+' · |r| = 1';}
  rotate.onclick=()=>{auto=!auto;sync();invalidate();};result.sync=sync;sync();
 };
 return result;
}
