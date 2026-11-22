import {THREE,mat,mesh,sphere,tube,line,label} from '../scene-kit.js';
import {study,instrumentBase,ring,rounded,TAU} from '../study-kit.js';
import {magneticFieldLoop,MU0} from './physics-models.js';
export function createScene(){
 const group=new THREE.Group(),R=1.05,{brass,dark}=instrumentBase(group,5.4,3.5,-1.85),copper=mat('#c48663',.28,.72);let current=7.5,probeZ=.7;
 ring(R,.055,copper,group);for(const x of [-1.3,1.3]){rounded([.1,1.7,.1],brass,[x,-.95,0],group,.02);rounded([.3,.08,.2],dark,[x,-.15,0],group,.02);}
 for(const x of [-.4,.4]){mesh(new THREE.CylinderGeometry(.075,.08,.2,24),copper,[x,-1.62,1.15],group);tube([[x,-1.52,1.15],[x,-1.2,.65],[Math.sign(x)*.58,-.88,0]],.018,mat(x<0?'#637681':'#9d6658',.65),group,24);}
 const paths=[],fieldGroup=new THREE.Group();group.add(fieldGroup);const colors=['#8aa9b9','#8dbfb7','#bbccb9'];
 // Integrate normalized B in a meridional plane; azimuthal copies follow axial symmetry.
 for(const seed of [.66,.8,.92]){let p=[seed,0,0],points=[p];for(let i=0;i<600;i++){const b=magneticFieldLoop(p,{radius:R,current:1,segments:72}),len=Math.hypot(...b);if(len<1e-15)break;const mid=p.map((x,j)=>x+.01*b[j]/len),bm=magneticFieldLoop(mid,{radius:R,current:1,segments:72}),lm=Math.hypot(...bm);p=p.map((x,j)=>x+.02*bm[j]/lm);points.push(p);if(Math.hypot(...p)>4.2||i>25&&Math.hypot(p[0]-seed,p[2])<.05)break;}
  for(let k=0;k<7;k++){const a=k/7*TAU,pts=points.map(([x,y,z])=>[x*Math.cos(a),x*Math.sin(a),z]);line(pts,colors[k%3],fieldGroup,.48);paths.push(pts);}
 }
 const arrows=[];paths.forEach((p,i)=>{const j=Math.floor(p.length*.32),a=new THREE.Vector3(...p[j]),d=new THREE.Vector3(...p[j+2]).sub(a).normalize(),arrow=new THREE.ArrowHelper(d,a,.15,'#b5d6c6',.09,.045);group.add(arrow);arrows.push({arrow,d});});
 const probe=sphere([0,0,0],.075,mat('#efd4a0',.23,.3),group);ring(.16,.015,brass,probe).rotation.y=Math.PI/2;
 line([[0,0,-2.5],[0,0,2.5]],'#bea675',group,.4);label('AXIAL PROBE',[0,.22,2.2],'#ddc49b',.12,group);
 const readout=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(),.4,'#e2c48e',.13,.06);group.add(readout);
 function refresh(){fieldGroup.visible=current!==0;probe.position.set(0,0,probeZ);arrows.forEach(({arrow,d})=>{arrow.visible=current!==0;arrow.setDirection(d.clone().multiplyScalar(Math.sign(current)||1));});readout.position.copy(probe.position);readout.visible=current!==0;readout.setDirection(new THREE.Vector3(0,0,Math.sign(current)||1));readout.setLength(.2+Math.abs(current)*.035,.1,.05);}
 const reset=()=>{current=7.5;probeZ=.7;refresh();};reset();
 return study(group,{reset,controls:[{id:'current',label:'Loop current (amperes)',type:'range',min:-12,max:12,step:.5,get:()=>current,set:v=>{current=v;refresh();}},{id:'probe',label:'Probe position z (metres)',type:'range',min:-2,max:2,step:.05,get:()=>probeZ,set:v=>{probeZ=v;refresh();}},{id:'reverse',label:'Reverse the current',type:'button',set:()=>{current=-current;refresh();}}],stats:()=>[{label:'Probe Bz',value:(MU0*current*R*R/(2*(R*R+probeZ*probeZ)**1.5)*1e6).toFixed(3)+' µT'},{label:'Center field',value:(MU0*current/(2*R)*1e6).toFixed(3)+' µT'},{label:'Field direction',value:current===0?'Zero':current>0?'+z on axis':'−z on axis'}],views:{overview:{position:[5.1,3.2,7.6],target:[0,-.25,0]},detail:{position:[2.5,1.6,4.2],target:[0,0,0]}},note:'The ideal circular loop has radius 1.05 m. A thin circular current loop. Field-line geometry integrates normalized Biot–Savart vectors using midpoint steps and 72-segment quadrature; traces stop at the display boundary. Direction arrows reverse with current. Probe values use the exact on-axis formula in SI units. Lines are selected geometric streamlines, not moving particles or a measurement of flux density by line spacing.',sources:[{title:'OpenStax University Physics 2 — Biot–Savart law',url:'https://openstax.org/books/university-physics-volume-2/pages/12-1-the-biot-savart-law'}]});
}
