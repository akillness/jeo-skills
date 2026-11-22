import {THREE,mat,mesh,sphere,line,label} from '../scene-kit.js';
import {study,ring,dynamicLine,TAU,parametric} from '../study-kit.js';
import {phasorChain,fourierValue} from './math-models.js';
export function createScene(){
 const group=new THREE.Group(),state={n:7,t:0,playing:true},chainGroup=new THREE.Group();chainGroup.position.set(-1.85,.1,0);group.add(chainGroup);
 const gold=mat('#e2ba77',.3,.55),rose=mat('#d7889c',.28,.3),circleMaterial=mat('#8eacaa',.4,.25),links=[],tips=[],rings=[];
 for(let i=0;i<15;i++){const r=4/(Math.PI*(2*i+1));rings.push(ring(r,.011,circleMaterial,chainGroup));links.push(dynamicLine(2,i%2?'#b4dacf':'#e6c48b',chainGroup));tips.push(sphere([0,0,0],i===0?.045:.03,i%2?rose:gold,chainGroup));}
 const wave=dynamicLine(360,'#edacb6',group),connector=dynamicLine(2,'#e3c890',group,.6),cursor=sphere([0,0,0],.055,rose,group);
 const ribbonGeometry=parametric((u,v)=>[.25+3.1*u,0,-v*.3],359,1);
 mesh(ribbonGeometry,new THREE.MeshPhysicalMaterial({color:'#d48b9e',roughness:.34,metalness:.25,side:THREE.DoubleSide,clearcoat:.2}),[0,0,0],group);
 for(const y of [-1,0,1])line([[.15,y+.1,0],[3.45,y+.1,0]],'#77969a',group,y===0?.35:.12);
 for(let i=0;i<=4;i++)line([[.25+i*.75,-1.25,0],[.25+i*.75,1.5,0]],'#77969a',group,.12);
 label('ROTATING PHASORS',[-1.8,-1.8,0],'#a7c5bf',.13,group);label('FINITE SQUARE-WAVE SUM',[1.8,-1.8,0],'#d9a5ad',.13,group);
 const spectrum=new THREE.Group();group.add(spectrum);const bars=[];
 for(let i=0;i<15;i++){const height=.5/(2*i+1),bar=mesh(new THREE.CylinderGeometry(.023,.023,height,10),gold,[.32+i*.2,-1.42+height/2,.05],spectrum);bars.push(bar);}
 function update(dt){if(state.playing)state.t=(state.t+dt*.65)%TAU;const chain=phasorChain(state.n,state.t);
  for(let i=0;i<15;i++){const on=i<state.n;rings[i].visible=links[i].visible=tips[i].visible=bars[i].visible=on;if(on){rings[i].position.set(...chain[i],0);links[i].setPoints([[...chain[i],.01],[...chain[i+1],.01]]);tips[i].position.set(...chain[i+1],.01);}}
  const end=chain.at(-1);const y=.1+end[1];cursor.position.set(.25,y,0);connector.setPoints([[-1.85+end[0],y,.02],[.25,y,.02]]);
  const points=Array.from({length:360},(_,i)=>[.25+3.1*i/359,.1+fourierValue(state.n,state.t-i/359*TAU),0]);wave.setPoints(points);
  const p=ribbonGeometry.attributes.position;for(let i=0;i<360;i++){p.setY(i*2,points[i][1]);p.setY(i*2+1,points[i][1]);}p.needsUpdate=true;ribbonGeometry.computeVertexNormals();
 }
 function reset(){Object.assign(state,{n:7,t:0,playing:true});update(0);}update(0);
 return study(group,{update,reset,needsAnimation:()=>state.playing,controls:[{id:'terms',label:'Odd harmonic terms',type:'range',min:1,max:15,step:1,get:()=>state.n,set:v=>state.n=v},{id:'phase',label:'Phase (radians)',type:'range',min:0,max:6.283,step:.01,get:()=>state.t,set:v=>{state.t=v;state.playing=false;}},{id:'run',label:'Play / pause the synthesis',type:'button',set:()=>state.playing=!state.playing}],stats:()=>[{label:'Terms',value:state.n},{label:'Current sum',value:fourierValue(state.n,state.t).toFixed(3)},{label:'Highest harmonic',value:2*state.n-1}],
 views:{overview:{position:[.3,1,10],target:[.1,-.1,0]},detail:{position:[.2,.2,6.6],target:[0,0,0]}},note:'The endpoint and the trace share one scale and one time state. Each phasor has amplitude 4/[π(2k+1)] and angular frequency 2k+1. The trace shows one past period of the finite square-wave series, including finite-sum ringing. Circle depth is a presentation choice.',sources:[{title:'MIT ES.1803 — Fourier series, §§21–22',url:'https://ocw.mit.edu/courses/es-1803-differential-equations-spring-2024/mites_1803_s24_topic_full.pdf'}]});
}
