import {THREE,mat,mesh,sphere,tube,line,label} from '../scene-kit.js';
import {study,ring,TAU,dynamicLine} from '../study-kit.js';
import {advanceCycle} from '../body-motion.js';
import {sarcomereState,THIN_LENGTH,THICK_LENGTH} from '../sarcomere-model.js';
export function createScene(){
 const group=new THREE.Group(),ivory=mat('#ddcbb0',.48,.1),actin=mat('#68bbb7',.42,.1),myosin=mat('#c57c96',.43,.08),gold=mat('#dcb97a',.4,.25);
 const left=new THREE.Group(),right=new THREE.Group(),thick=new THREE.Group();group.add(left,right,thick);
 const rows=[[.27,.19],[.27,-.19],[-.27,.19],[-.27,-.19]],heads=[];
 for(const side of [left,right]){
  const rim=ring(.48,.027,ivory,side);rim.rotation.y=Math.PI/2;
  label('Z DISC',[0,.72,0],'#e3d1b9',.16,side);
  for(const [y,z] of rows){tube([[0,0,0],[0,y,z]],.012,ivory,side,2);sphere([0,y,z],.045,ivory,side);}
  const beads=new THREE.InstancedMesh(new THREE.SphereGeometry(.026,10,8),actin,rows.length*60*2),d=new THREE.Object3D();let index=0;
  for(const [y,z] of rows)for(let i=0;i<60;i++)for(let strand=0;strand<2;strand++){const a=i*.52+strand*Math.PI;d.position.set(i/59*THIN_LENGTH,y+.026*Math.cos(a),z+.026*Math.sin(a));d.updateMatrix();beads.setMatrixAt(index++,d.matrix);}
  beads.castShadow=beads.receiveShadow=true;side.add(beads);
 }
 right.rotation.y=Math.PI; // Symmetric thin-filament pairs point inward from each Z disc.
 mesh(new THREE.CylinderGeometry(.095,.095,THICK_LENGTH,32),myosin,[0,0,0],thick).rotation.z=Math.PI/2;
 for(let i=0;i<8;i++){const a=i/8*TAU;tube([[-THICK_LENGTH/2,.083*Math.cos(a),.083*Math.sin(a)],[THICK_LENGTH/2,.083*Math.cos(a),.083*Math.sin(a)]],.018,myosin,thick,2);}
 const m=ring(.12,.012,ivory,thick);m.rotation.y=Math.PI/2;label('M LINE',[0,.62,0],'#e3c6ca',.13,group);
 for(const [y,z] of rows)for(const sign of [-1,1])for(let i=0;i<8;i++){
  const x=sign*(.2+i*.103),radius=Math.hypot(y,z),targetX=x-sign*.04;
  const bridge=new THREE.Group();thick.add(bridge);
  tube([[x,y/radius*.09,z/radius*.09],[targetX,y*.83,z*.83]],.014,gold,bridge,2);sphere([targetX,y*.9,z*.9],.037,gold,bridge,[1.2,.7,.7]);
  heads.push({bridge,x:targetX,sign});
 }
 const aBand=dynamicLine(4,'#d49aaf',group,.8),hZone=dynamicLine(4,'#ebc77d',group,.8);
 aBand.setPoints([[-THICK_LENGTH/2,-.68,0],[-THICK_LENGTH/2,-.8,0],[THICK_LENGTH/2,-.8,0],[THICK_LENGTH/2,-.68,0]]);
 label('A BAND · THICK LENGTH STAYS FIXED',[0,-1.02,0],'#d59caf',.13,group);
 label('H ZONE · THICK ONLY',[0,-.54,0],'#e3c28a',.105,group);
 let phase=.15,shortening=.05,playing=true,showThick=true,showHeads=false,state=sarcomereState(shortening);
 function update(dt){if(playing){phase=advanceCycle(phase,dt,6);shortening=.125*(1-Math.cos(TAU*phase));}state=sarcomereState(shortening);
  left.position.x=-state.half;right.position.x=state.half;thick.visible=showThick;
  for(const {bridge,x,sign} of heads)bridge.visible=showHeads&&(sign<0?x<=state.leftTip:x>=state.rightTip);
  hZone.setPoints([[state.leftTip,-.31,0],[state.leftTip,-.39,0],[state.rightTip,-.39,0],[state.rightTip,-.31,0]]);
 }
 function reset(){phase=.15;shortening=.05;playing=true;showThick=true;showHeads=false;update(0);}update(0);
 return study(group,{update,reset,needsAnimation:()=>playing,lighting:{exposure:.84,key:8,fill:2.5,rim:9},controls:[
  {id:'length',label:'Shorter than resting length (%)',type:'range',min:0,max:25,step:1,get:()=>state.fraction*100,set:v=>{shortening=v/100;phase=Math.acos(1-2*shortening/.25)/TAU;playing=false;}},
  {id:'run',label:'Filament sliding',getLabel:()=>playing?'Pause filament sliding':'Play filament sliding',type:'button',set:()=>playing=!playing},
  {id:'rest',label:'Compare: resting length',type:'button',set:()=>{shortening=0;phase=0;playing=false;}},
  {id:'short',label:'Compare: 25% shorter',type:'button',set:()=>{shortening=.25;phase=.5;playing=false;}},
  {id:'thick',label:'Thick filament',getLabel:()=>showThick?'Hide myosin to isolate actin':'Show the thick myosin filament',type:'button',set:()=>showThick=!showThick},
  {id:'heads',label:'Show / hide schematic bridges in overlap',type:'button',set:()=>showHeads=!showHeads}
 ],stats:()=>[{label:'Z-to-Z length',value:state.length.toFixed(2)+' display units'},{label:'Shortening',value:(state.fraction*100).toFixed(0)+'%'},{label:'A band',value:THICK_LENGTH+' · constant'}],views:{overview:{position:[.6,1.2,7.7],target:[0,-.14,0]},detail:{position:[1.6,.9,4.7],target:[0,-.05,0]}},note:'A reduced longitudinal sarcomere study, not a full molecular lattice. Teal actin filaments attach to the moving Z discs; the rose myosin filament is centered at the M line. Sarcomere length is L = 3.9(1 − shortening). Thin length stays 1.35 and thick/A-band length stays 2.05 display units. I-band portions and the central H zone narrow as overlap increases. Optional gold bridges mark only overlap locations; they do not depict ATP-driven attach/pull/release cycles or produce the prescribed motion. Counts, spacing, shape, scale and cycle timing are authored. Returning to resting length is prescribed lengthening, not myosin pushing the filaments apart.',sources:[{title:'OpenStax — Sliding filament model and cross-bridge cycle',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/10-3-muscle-fiber-contraction-and-relaxation'},{title:'OpenStax — Sarcomere, A/I bands and H zone',url:'https://openstax.org/books/anatomy-and-physiology-2e/pages/10-2-skeletal-muscle'}]});
}
