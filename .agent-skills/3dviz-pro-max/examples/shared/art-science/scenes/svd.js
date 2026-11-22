import {THREE,mat,mesh,sphere,line,label,tube} from '../scene-kit.js';
import {study,curvePoints,TAU} from '../study-kit.js';
import {svdPoint} from './math-models.js';
export function createScene(){
 const group=new THREE.Group(),transform=new THREE.Group();group.add(transform);
 const state={stage:0,s:[1.8,1,.45],playing:true},ivory=mat('#e1cc9e',.24,.5),teal=mat('#65bba9',.3,.3);
 const shell=mesh(new THREE.SphereGeometry(1,64,40),new THREE.MeshPhysicalMaterial({color:'#70bfae',roughness:.24,metalness:.1,transparent:true,opacity:.15,side:THREE.DoubleSide,depthWrite:false}),[0,0,0],transform);
 for(let i=1;i<12;i++){const phi=Math.PI*i/12;tube(curvePoints(t=>[Math.cos(t*TAU)*Math.sin(phi),Math.cos(phi),Math.sin(t*TAU)*Math.sin(phi)],96),.007,teal,transform,96,true);}
 for(let i=0;i<12;i++){const phi=TAU*i/12;tube(curvePoints(t=>[Math.cos(phi)*Math.sin(t*TAU),Math.cos(t*TAU),Math.sin(phi)*Math.sin(t*TAU)],96),.005,ivory,transform,96,true);}
 const original=new THREE.Group();group.add(original);for(let i=0;i<3;i++){const p=curvePoints(t=>{const q=[Math.cos(t*TAU),Math.sin(t*TAU),0];return i===0?q:i===1?[q[0],0,q[1]]:[0,q[0],q[1]];});line(p,'#89a7aa',original,.25);}
 const colors=['#eaa28c','#97d8c7','#d6bf82'],arrows=[],tips=[];
 for(let i=0;i<3;i++){const a=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),1,colors[i],.14,.07);group.add(a);arrows.push(a);tips.push(sphere([0,0,0],.045,mat(colors[i],.2,.3),group));}
 const lattice=new THREE.Group();group.add(lattice);for(let i=-4;i<=4;i++){line([[-2,-1.5,i*.5],[2,-1.5,i*.5]],'#6d9290',lattice,.15);line([[i*.5,-1.5,-2],[i*.5,-1.5,2]],'#6d9290',lattice,.15);}
 label('Vᵀ',[-1.6,-1.65,1.1],'#e4b59b',.24,group);label('Σ',[0,-1.65,1.1],'#a9dfce',.24,group);label('U',[1.6,-1.65,1.1],'#e5d1a1',.24,group);
 const stepDots=[-1.6,0,1.6].map(x=>sphere([x,-1.35,1.1],.035,ivory.clone(),group));
 function update(dt){if(state.playing){state.stage=Math.min(3,state.stage+dt*.4);if(state.stage===3)state.playing=false;}
  const basis=[0,1,2].map(i=>svdPoint([+(i===0),+(i===1),+(i===2)],state.stage,state.s));
  transform.matrixAutoUpdate=false;transform.matrix.makeBasis(...basis.map(p=>new THREE.Vector3(...p)));
  for(let i=0;i<3;i++){const d=new THREE.Vector3(...basis[i]),l=d.length();arrows[i].visible=l>1e-8;arrows[i].setDirection(l?d.clone().normalize():new THREE.Vector3(0,0,1));arrows[i].setLength(Math.max(.001,l)*1.2,.12,.065);tips[i].position.copy(d.multiplyScalar(1.2));stepDots[i].material.emissive.set(state.stage>=i?'#7e6140':'#000000');}
  // At a rank drop the parametrized surface degenerates; keep the mapped lattice and basis readable.
  shell.visible=!(state.s[2]===0&&state.stage>=2);
 }
 const reset=()=>{Object.assign(state,{stage:0,s:[1.8,1,.45],playing:false});update(0);};update(0);
 return study(group,{update,reset,needsAnimation:()=>state.playing,controls:[
 {id:'stage',label:'Factorization progress',type:'range',min:0,max:3,step:.01,get:()=>state.stage,set:v=>{state.stage=v;state.playing=false;}},
 {id:'s1',label:'Largest singular value σ₁',type:'range',min:1,max:2.25,step:.05,get:()=>state.s[0],set:v=>state.s[0]=v},
 {id:'s3',label:'Smallest singular value σ₃',type:'range',min:0,max:1,step:.05,get:()=>state.s[2],set:v=>state.s[2]=v},
 {id:'play',label:'Replay the three transformations',type:'button',set:()=>{state.stage=0;state.playing=true;}}
 ],stats:()=>[{label:'Operation',value:state.stage<1?'Vᵀ · rotate':state.stage<2?'Σ · stretch':'U · rotate'},{label:'det(A)',value:(state.s[0]*state.s[2]).toFixed(3)},{label:'Rank at completion',value:state.s[2]===0?'2':'3'}],
 views:{overview:{position:[3.8,2.1,6.6],target:[0,-.15,0]},detail:{position:[2,1.2,4],target:[0,0,0]}},
 note:'Column-vector factorization A=UΣVᵀ with proper rotations and ordered nonnegative singular values. The ghost sphere and floor grid are fixed references; the spherical latitude/longitude lattice undergoes the displayed linear map. At σ₃=0 the final image has rank two. No geometry is rebuilt during playback.',
 sources:[{title:'MIT 18.06SC — Singular Value Decomposition',url:'https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/pages/positive-definite-matrices-and-applications/singular-value-decomposition/'}]});
}
