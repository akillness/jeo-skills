import {THREE,mat,mesh,line} from '../scene-kit.js';
import {study,ring,rounded,TAU} from '../study-kit.js';
import {MEMBRANE_MODES,membraneFrequency,membraneModeValue} from './physics-models.js';
export function createScene(){
 const group=new THREE.Group(),R=1.45,gold=mat('#be9f72',.3,.7),dark=mat('#273740',.4,.6);let modeId='2,1',tension=64,density=.32,time=0,running=true,slow=.08,shape=[];
 mesh(new THREE.CylinderGeometry(1.62,1.55,.44,96,1,true),dark,[0,-.28,0],group);
 for(const y of [-.47,-.08])ring(1.56,.025,gold,group,[0,y,0]).rotation.x=-Math.PI/2;
 ring(R+.035,.045,gold,group).rotation.x=-Math.PI/2;
 for(let i=0;i<18;i++){const a=i/18*TAU,x=1.56*Math.cos(a),z=1.56*Math.sin(a);mesh(new THREE.CylinderGeometry(.04,.04,.05,6),gold,[x,.005,z],group);if(i%6===0){rounded([.14,.7,.14],dark,[x,-.82,z],group,.04);}}
 const sectors=100,rings=40,p=[0,0,0],radial=[0],angles=[0],ix=[];
 for(let j=1;j<=rings;j++)for(let i=0;i<sectors;i++){const r=j/rings,a=i/sectors*TAU;p.push(R*r*Math.cos(a),0,R*r*Math.sin(a));radial.push(r);angles.push(a);}
 for(let i=0;i<sectors;i++)ix.push(0,1+(i+1)%sectors,1+i);
 for(let j=1;j<rings;j++)for(let i=0;i<sectors;i++){const a=1+(j-1)*sectors+i,b=1+(j-1)*sectors+(i+1)%sectors;ix.push(a,b,a+sectors,b,b+sectors,a+sectors);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(p.length),3));g.setIndex(ix);
 mesh(g,new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.35,metalness:.28,side:THREE.DoubleSide,clearcoat:.15}),[0,0,0],group);
 const nodal=new THREE.Group();group.add(nodal);let nodalLines=[];
 function prepare(){const mode=MEMBRANE_MODES[modeId];shape=radial.map((r,i)=>membraneModeValue(mode,r,angles[i]));const peak=Math.max(...shape.map(Math.abs));shape=shape.map(x=>x/peak);
  nodalLines.forEach(o=>{o.geometry.dispose();o.material.dispose();o.removeFromParent();});nodalLines=[];
  for(let i=0;i<mode.m;i++){const a=(Math.PI/2+i*Math.PI)/mode.m;nodalLines.push(line([[-R*Math.cos(a),.012,-R*Math.sin(a)],[R*Math.cos(a),.012,R*Math.sin(a)]],'#eeddb7',nodal,.8));}
  if(modeId==='0,2'){const r=R*2.4048255577/5.5200781103;nodalLines.push(line(Array.from({length:129},(_,i)=>[r*Math.cos(i/128*TAU),.012,r*Math.sin(i/128*TAU)]),'#eeddb7',nodal,.8));}
 }
 function update(dt){if(running)time+=dt*slow;const f=membraneFrequency({zero:MEMBRANE_MODES[modeId].zero,radius:R,tension,density}),phase=Math.cos(TAU*f*time),pos=g.attributes.position,col=g.attributes.color;
  for(let i=0;i<shape.length;i++){const d=.32*shape[i]*phase;pos.setY(i,d);const u=.5+.5*d/.32;col.setXYZ(i,.31+.42*u,.38+.25*(1-Math.abs(2*u-1)),.58+.2*(1-u));}pos.needsUpdate=col.needsUpdate=true;g.computeVertexNormals();
 }
 const reset=()=>{modeId='2,1';time=0;tension=64;density=.32;slow=.08;running=true;prepare();update(0);};reset();
 return study(group,{lighting:{exposure:.68,key:7,fill:2,rim:8},update,reset,needsAnimation:()=>running,controls:[{id:'mode',label:'Mode · angular / radial order',type:'select',options:Object.keys(MEMBRANE_MODES).map(value=>({value,label:`Mode (${value})`})),get:()=>modeId,set:v=>{modeId=v;time=0;prepare();}},{id:'tension',label:'Membrane tension (N/m)',type:'range',min:20,max:120,step:1,get:()=>tension,set:v=>tension=v},{id:'slow',label:'Playback time scale',type:'range',min:.02,max:.2,step:.01,get:()=>slow,set:v=>slow=v},{id:'play',label:'Play / pause the vibration',type:'button',set:()=>running=!running}],stats:()=>[{label:'Natural frequency',value:membraneFrequency({zero:MEMBRANE_MODES[modeId].zero,radius:R,tension,density}).toFixed(2)+' Hz'},{label:'Playback',value:slow.toFixed(2)+'× time'},{label:'Interior nodal circles',value:MEMBRANE_MODES[modeId].n-1}],views:{overview:{position:[3.1,3.7,5.5],target:[0,-.2,0]},detail:{position:[1.8,2.5,3.4],target:[0,0,0]}},note:'Display radius is 1.45 m; membrane areal density is 0.32 kg/m². These are free normal modes, with no driving force or resonance-response calculation. Analytical circular-membrane modes Jm(jmn r/R) cos(mθ) cos(2πft), fixed at the rim. Golden lines mark zero-displacement nodes. The radial order n counts from one, so there are n−1 interior nodal circles. Displacement is enlarged and playback slowed; this is a membrane model, not a stiff Chladni plate or sand simulation.',sources:[{title:'UIUC Physics 406 — Circular membranes',url:'https://courses.physics.illinois.edu/phys406/sp2017/Lecture_Notes/P406POM_Lecture_Notes/P406POM_Lect4_Part2.pdf'}]});
}
