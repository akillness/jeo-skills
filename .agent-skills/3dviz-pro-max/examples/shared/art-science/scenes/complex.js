import {THREE,mat,mesh,sphere,line,label} from '../scene-kit.js';
import {study,ring,curvePoints,dynamicLine,TAU} from '../study-kit.js';
import {sphereFromComplex,reciprocal} from './math-models.js';
export function createScene(){
 const group=new THREE.Group(),state={x:.8,y:.5,t:0,playing:false},R=1.35;
 const brass=mat('#d9b879',.26,.65),blue=mat('#81b8d5',.28,.3),pink=mat('#dfa4bc',.27,.3);
 const globe=new THREE.Group();group.add(globe);
 sphere([0,0,0],R,new THREE.MeshPhysicalMaterial({color:'#5995ad',roughness:.32,metalness:.08,transparent:true,opacity:.09,depthWrite:false}),globe);
 for(let i=1;i<12;i++){const a=Math.PI*i/12;line(curvePoints(t=>[R*Math.sin(a)*Math.cos(t*TAU),R*Math.cos(a),R*Math.sin(a)*Math.sin(t*TAU)]),'#91b8c8',globe,.28);}
 for(let i=0;i<12;i++){const a=i/12*TAU;line(curvePoints(t=>[R*Math.sin(t*TAU)*Math.cos(a),R*Math.cos(t*TAU),R*Math.sin(t*TAU)*Math.sin(a)]),'#91b8c8',globe,.28);}
 ring(R,.009,brass,globe).rotation.x=Math.PI/2;
 const grid=new THREE.Group();group.add(grid);for(let i=-6;i<=6;i++){const p=i*.4;line([[p,0,-2.4],[p,0,2.4]],'#6b858f',grid,i===0?.65:.18);line([[-2.4,0,p],[2.4,0,p]],'#6b858f',grid,i===0?.65:.18);}
 const north=sphere([0,R,0],.04,brass,group);label('∞',[0,R+.22,0],'#e4c991',.22,group);label('Re',[2.5,0,0],'#a9ccd8',.14,group);label('Im',[0,0,2.5],'#a9ccd8',.14,group);
 const zSphere=sphere([0,0,0],.07,blue,group),wSphere=sphere([0,0,0],.07,pink,group),zPlane=sphere([0,0,0],.045,blue,group),wPlane=sphere([0,0,0],.045,pink,group);
 const zRay=dynamicLine(3,'#99d3eb',group,.8),wRay=dynamicLine(3,'#e7b4c9',group,.8),mappedPath=dynamicLine(180,'#d8ba8b',group,.45);
 const project=(x,y)=>{const p=sphereFromComplex(x,y);return[p[0]*R,p[2]*R,p[1]*R];};let inverse;
 function update(dt){if(state.playing){state.t+=dt*.45;state.x=1.15*Math.cos(state.t);state.y=.8*Math.sin(state.t);}
  inverse=reciprocal(state.x,state.y);const a=project(state.x,state.y),plane=[R*state.x,0,R*state.y];zSphere.position.set(...a);zPlane.position.set(...plane);zRay.setPoints([[0,R,0],a,plane]);
  const b=inverse.infinity?[0,R,0]:project(inverse.x,inverse.y);wSphere.position.set(...b);const visible=!inverse.infinity&&Math.hypot(inverse.x,inverse.y)<2.8;wPlane.visible=wRay.visible=visible;
  if(visible){const p=[R*inverse.x,0,R*inverse.y];wPlane.position.set(...p);wRay.setPoints([[0,R,0],b,p]);}
  north.scale.setScalar(inverse.infinity?1.8:1);mappedPath.setPoints(Array.from({length:180},(_,i)=>project(1.15*Math.cos(i/179*TAU),.8*Math.sin(i/179*TAU))));
 }
 const reset=()=>{Object.assign(state,{x:.8,y:.5,t:0,playing:false});update(0);};update(0);
 return study(group,{update,reset,needsAnimation:()=>state.playing,controls:[{id:'real',label:'Real part of z',type:'range',min:-1.8,max:1.8,step:.02,get:()=>state.x,set:v=>{state.x=v;state.playing=false;}},{id:'imaginary',label:'Imaginary part of z',type:'range',min:-1.8,max:1.8,step:.02,get:()=>state.y,set:v=>{state.y=v;state.playing=false;}},{id:'zero',label:'Send z to zero · reveal infinity',type:'button',set:()=>{state.x=state.y=0;state.playing=false;}},{id:'orbit',label:'Trace an ellipse / pause',type:'button',set:()=>state.playing=!state.playing}],stats:()=>[{label:'z',value:`${state.x.toFixed(2)} ${state.y<0?'−':'+'} ${Math.abs(state.y).toFixed(2)}i`},{label:'1/z',value:inverse.infinity?'∞':`${inverse.x.toFixed(2)} ${inverse.y<0?'−':'+'} ${Math.abs(inverse.y).toFixed(2)}i`},{label:'Projection plane',value:'Equatorial · y = 0'}],views:{overview:{position:[4.3,3.3,6.5],target:[0,.15,0]},detail:{position:[2.5,2,3.9],target:[0,.2,0]}},note:'Stereographic projection from the north pole to the equatorial plane. Coordinates obey z=(X+iY)/(1−Z), then rotate together into the display frame. Blue is z, pink is 1/z. Zero maps exactly to infinity under reciprocal inversion. Far plane markers are hidden at the frame boundary; their sphere point and numeric readout remain exact.',sources:[{title:'MIT 18.04 — Riemann sphere, §4.4',url:'https://math.mit.edu/~dunkel/Teach/18.04_2019S/notes/1804_Main.pdf'}]});
}
