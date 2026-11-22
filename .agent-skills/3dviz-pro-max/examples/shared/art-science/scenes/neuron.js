import {THREE,mat,mesh,sphere,tube,line} from '../scene-kit.js';
import {study,strand,ring,TAU} from '../study-kit.js';
export function createScene(){
 const group=new THREE.Group(),somaMaterial=new THREE.MeshPhysicalMaterial({color:'#b58baf',roughness:.5,clearcoat:.12,transparent:true,opacity:1}),branchMaterial=mat('#9e819f',.5),axonMaterial=mat('#c9b088',.38),myelinMaterial=mat('#dfcdb8',.43);
 let seed=87;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const somaGeometry=new THREE.SphereGeometry(.56,64,48),p=somaGeometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),r=1+.08*Math.sin(x*11)*Math.cos(y*9)+.045*Math.sin(z*15);p.setXYZ(i,x*r,y*r*.87,z*r*.8);}somaGeometry.computeVertexNormals();
 const soma=mesh(somaGeometry,somaMaterial,[-1.2,.15,0],group);sphere([-1.2,.15,0],.23,mat('#805a85',.5),group);sphere([-1.16,.19,.12],.065,mat('#d1a5bc',.35),group);
 function fork(start,direction,length,radius,depth){const end=start.clone().addScaledVector(direction,length),mid=start.clone().lerp(end,.55).add(new THREE.Vector3((rand()-.5)*.18,(rand()-.5)*.18,(rand()-.5)*.2));strand([start.toArray(),mid.toArray(),end.toArray()],radius,branchMaterial,group,depth?radius*.55:.008);
  if(depth){for(const sign of [-1,1]){const d=direction.clone().applyAxisAngle(new THREE.Vector3(.15,0,1).normalize(),sign*(.3+rand()*.35));d.z+=(rand()-.5)*.4;fork(end,d.normalize(),length*(.52+rand()*.15),radius*.55,depth-1);}}
 }
 for(let i=0;i<7;i++){const a=.5+i/6*(TAU-1),d=new THREE.Vector3(Math.cos(a),Math.sin(a),Math.sin(i*2)*.32).normalize();if(d.x>.8)continue;const start=new THREE.Vector3(-1.2,.15,0).addScaledVector(d,.42);fork(start,d,.78,.085,3);}
 const curve=new THREE.CatmullRomCurve3([[-.72,.12,0],[-.25,.02,.03],[.5,.13,0],[1.3,-.12,.06],[2.1,.12,.12],[2.75,.22,.08]].map(p=>new THREE.Vector3(...p)));
 mesh(new THREE.TubeGeometry(curve,128,.04,12,false),axonMaterial,[0,0,0],group);
 const sheaths=new THREE.Group();group.add(sheaths);const nodes=[];
 for(let i=0;i<7;i++){const start=.1+i*.115,end=start+.087,sub=new THREE.CatmullRomCurve3(Array.from({length:12},(_,j)=>curve.getPoint(start+(end-start)*j/11)));
  mesh(new THREE.TubeGeometry(sub,18,.125,20,false),myelinMaterial,[0,0,0],sheaths);
  for(const t of [start,end]){const o=ring(.119,.012,myelinMaterial,sheaths,curve.getPoint(t).toArray());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),curve.getTangent(t));}
  const node=sphere(curve.getPoint(end+.014).toArray(),.047,mat('#aabecd',.3,0,{emissive:'#6caabd',emissiveIntensity:0}),group);nodes.push({node,t:end+.014});
 }
 const terminal=curve.getPoint(1);for(let i=0;i<5;i++){const end=[3.25+(i%2)*.15,.22+(i-2)*.3,(i%3-1)*.28];strand([terminal.toArray(),[2.96,end[1]*.6,end[2]*.5],end],.032,branchMaterial,group,.015);sphere(end,.07,axonMaterial,group);}
 const wave=sphere([0,0,0],.065,mat('#b7ecde',.25,0,{emissive:'#6acbb5',emissiveIntensity:1}),group);let progress=0,speed=.25,playing=true,interior=false;
 function update(dt){if(playing){progress+=dt*speed;if(progress>1){progress=1;playing=false;}}wave.visible=progress<1;wave.position.copy(curve.getPointAt(Math.min(progress,1)));nodes.forEach(({node,t})=>node.material.emissiveIntensity=Math.max(0,1-Math.abs(curve.getUtoTmapping(progress)-t)/.08)*1.5);somaMaterial.opacity=interior?.2:1;somaMaterial.depthWrite=!interior;}
 function reset(){progress=0;speed=.25;playing=true;interior=false;sheaths.visible=true;update(0);}update(0);
 return study(group,{update,reset,needsAnimation:()=>playing,controls:[{id:'fire',label:'Trigger one signal',type:'button',set:()=>{progress=0;playing=true;}},{id:'speed',label:'Propagation display speed',type:'range',min:.08,max:.6,step:.02,get:()=>speed,set:v=>speed=v},{id:'myelin',label:'Reveal / hide myelin sheaths',type:'button',set:()=>sheaths.visible=!sheaths.visible},{id:'soma',label:'Reveal / hide the nucleus',type:'button',set:()=>interior=!interior}],stats:()=>[{label:'Signal',value:playing?'Propagating':'At rest'},{label:'Axon traversal',value:Math.round(progress*100)+'%'},{label:'Sheaths',value:sheaths.visible?'7 visible segments':'Hidden'}],views:{overview:{position:[.4,1.4,11],target:[0,.05,0]},detail:{position:[.8,.65,6.5],target:[.1,.05,0]}},note:'An authored multipolar-neuron illustration with tapering dendritic branches, a soma, one axon, myelin segments and terminal branches. The marker and nodal glow are directional teaching cues; they are not voltage, literal ion motion or a calibrated action-potential solver. Hiding myelin changes visibility only, not physiological conduction speed.',sources:[{title:'OpenStax — Basic structure of the nervous system',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/12-1-basic-structure-and-function-of-the-nervous-system'},{title:'OpenStax — The action potential',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/12-4-the-action-potential'}]});
}
