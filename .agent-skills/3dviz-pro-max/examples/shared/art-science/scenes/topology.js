import {THREE,mat,mesh,sphere,tube,line} from '../scene-kit.js';
import {study,parametric,curvePoints,TAU} from '../study-kit.js';
import {mobius,mobiusNormal,torus,trefoil} from './math-models.js';
export function createScene(){
 const group=new THREE.Group(),shapes={},state={kind:'mobius',u:0,playing:true};
 const silk=new THREE.MeshPhysicalMaterial({color:'#a78cc6',roughness:.3,metalness:.25,side:THREE.DoubleSide,clearcoat:.25,sheen:.6,sheenColor:'#e6b9d6',sheenRoughness:.65});
 const gold=mat('#e7c69c',.25,.65),teal=mat('#7bc1bd',.23,.4);
 for(const kind of ['mobius','torus','trefoil']){const g=new THREE.Group();group.add(g);shapes[kind]=g;
  if(kind==='trefoil'){tube(curvePoints(t=>trefoil(TAU*t),320),.16,teal,g,320,true);for(let j=0;j<3;j++){const t=j/3*TAU,p=trefoil(t);sphere(p,.175,gold,g);}continue;}
  mesh(parametric((u,v)=>kind==='mobius'?mobius(TAU*u,(v-.5)*1.05):torus(TAU*u,TAU*v),160,36),silk,[0,0,0],g);
  if(kind==='mobius'){
   tube(curvePoints(t=>mobius(t*TAU*2,.525),320),.012,gold,g,320,true);
   for(let j=0;j<13;j++){const s=(j/12-.5)*.96;line(curvePoints(t=>mobius(t*TAU,s),160),'#d8bfdc',g,.23);}
  }else{for(let i=0;i<12;i++)line(curvePoints(t=>torus(t*TAU,i/12*TAU),128),'#dac3e1',g,.23);tube(curvePoints(t=>torus(t*TAU,0)),.014,gold,g,128,true);tube(curvePoints(t=>torus(0,t*TAU)),.014,teal,g,128,true);}
 }
 const bead=sphere([0,0,0],.075,gold,group),normal=new THREE.ArrowHelper(new THREE.Vector3(0,0,1),new THREE.Vector3(),.42,'#e8d2a8',.1,.055);group.add(normal);
 function update(dt){if(state.playing)state.u=(state.u+dt*.5)%(TAU*2);for(const k in shapes)shapes[k].visible=k===state.kind;
  // Follow the centreline: after one circuit the position closes while its local normal reverses.
  const p=state.kind==='mobius'?mobius(state.u,0):state.kind==='torus'?torus(state.u,0):trefoil(state.u);bead.position.set(...p);normal.visible=state.kind==='mobius';if(normal.visible){normal.position.copy(bead.position);normal.setDirection(new THREE.Vector3(...mobiusNormal(state.u,0)));}}
 const reset=()=>{Object.assign(state,{kind:'mobius',u:0,playing:true});update(0);};update(0);
 return study(group,{update,reset,needsAnimation:()=>state.playing,controls:[{id:'form',label:'Study a surface or knot',type:'select',options:[{value:'mobius',label:'Möbius ribbon'},{value:'torus',label:'Torus · two cycles'},{value:'trefoil',label:'Trefoil knot'}],get:()=>state.kind,set:v=>{state.kind=v;state.u=0;}},{id:'travel',label:'Traversal (radians)',type:'range',min:0,max:12.566,step:.01,get:()=>state.u,set:v=>{state.u=v;state.playing=false;}},{id:'run',label:'Play / pause the travelling frame',type:'button',set:()=>state.playing=!state.playing}],stats:()=>[{label:'Object',value:state.kind},{label:'Circuits',value:(state.u/TAU).toFixed(2)},{label:'Boundary / type',value:state.kind==='mobius'?'One continuous edge':state.kind==='torus'?'None':'Closed curve'}],
 views:{overview:{position:[3.3,2.6,6.3],target:[0,0,0]},detail:{position:[2,1.6,3.8],target:[0,0,0]}},note:'Analytic parametrizations define all geometry. The Möbius centreline closes after one circuit while a locally transported normal reverses; two circuits restore it. The gold boundary itself is a single closed curve. On the torus, gold and teal show its two fundamental cycle directions; the moving bead follows the gold major cycle. The trefoil is a knotted closed curve, not a surface.',sources:[{title:'Allen Hatcher — Algebraic Topology',url:'https://pi.math.cornell.edu/~hatcher/AT/AT.pdf'}]});
}
