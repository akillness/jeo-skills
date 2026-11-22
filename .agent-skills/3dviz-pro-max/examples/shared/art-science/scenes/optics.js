import {THREE,mat,mesh,sphere,tube,line,label} from '../scene-kit.js';
import {study,instrumentBase,rounded,ring,dynamicLine,TAU} from '../study-kit.js';
import {tracePrismRay} from './physics-models.js';
const PRISM=[[-1.15,-.8],[1.15,-.8],[0,1.2]];
export function createScene(){
 const group=new THREE.Group(),{brass,dark}=instrumentBase(group,6.4,2.5,-1.5);let index=1.52,angle=0,dispersion=true,t=0,running=true,traces=[];
 const shape=new THREE.Shape();shape.moveTo(...PRISM[0]);PRISM.slice(1).forEach(p=>shape.lineTo(...p));shape.closePath();
 const glass=new THREE.MeshPhysicalMaterial({color:'#aed9df',roughness:.12,metalness:.05,transparent:true,opacity:.19,depthWrite:false,side:THREE.DoubleSide,clearcoat:.5});
 const g=new THREE.ExtrudeGeometry(shape,{depth:.8,bevelEnabled:false});g.translate(0,0,-.4);mesh(g,glass,[0,0,0],group);
 for(const z of [-.405,.405])for(let i=0;i<3;i++)tube([[...PRISM[i],z],[...PRISM[(i+1)%3],z]],.013,brass,group,2);
 for(const [x,y] of PRISM)tube([[x,y,-.4],[x,y,.4]],.01,brass,group,2);
 for(const x of [-.7,.7]){rounded([.13,.54,.45],dark,[x,-1.075,0],group,.02);rounded([.23,.055,.52],brass,[x,-.82,0],group,.015);}
 const dial=ring(1.5,.012,brass,group,[0,-1.34,0]);dial.rotation.x=-Math.PI/2;
 for(let i=0;i<72;i++){const a=TAU*i/72;line([[1.5*Math.cos(a),-1.33,1.5*Math.sin(a)],[(i%6?1.56:1.64)*Math.cos(a),-1.33,(i%6?1.56:1.64)*Math.sin(a)]],'#ac976a',group,.55);}
 rounded([1,.1,.75],dark,[-2.35,-1.32,0],group,.035);const laser=new THREE.Group();laser.position.set(-2.7,.2,0);group.add(laser);
 mesh(new THREE.CylinderGeometry(.14,.14,.55,40),dark,[0,0,0],laser).rotation.z=Math.PI/2;for(const x of [-.2,.1])ring(.145,.018,brass,laser,[x,0,0]).rotation.y=Math.PI/2;
 tube([[-2.45,-1.27,0],[-2.45,.1,0]],.045,brass,group,2);
 const wavelengths=[450,490,530,580,650],colors=['#9f96eb','#84bbec','#99d9b7','#ead69a','#e996a1'];const rays=colors.map(c=>dynamicLine(8,c,group,.9)),beads=colors.map(c=>sphere([0,0,0],.032,mat(c,.2,0,{emissive:c,emissiveIntensity:.5}),group));
 function refresh(){const a=angle*Math.PI/180;laser.rotation.z=a;
  traces=wavelengths.map((nm,i)=>{const n=index+(dispersion?.007*((550/nm)**2-1):0);const result=tracePrismRay({origin:[-2.7,.2],direction:[Math.cos(a),Math.sin(a)],index:n,vertices:PRISM});
   // The opaque bench terminates the emerging ray; it must not reappear below the table.
   const bounded=[result.points[0]];for(let j=1;j<result.points.length;j++){const p=result.points[j],prev=result.points[j-1];if(p[1]<-1.36){const u=(-1.36-prev[1])/(p[1]-prev[1]);bounded.push([prev[0]+u*(p[0]-prev[0]),-1.36]);break;}bounded.push(p);}result.points=bounded;
   rays[i].setPoints(result.points.map(p=>[...p,0]));rays[i].visible=dispersion||i===2;beads[i].visible=rays[i].visible;return result;});
 }
 function update(dt){if(running)t+=dt*.7;traces.forEach((trace,i)=>{const p=trace.points,lengths=[];let length=0;for(let j=1;j<p.length;j++){length+=Math.hypot(p[j][0]-p[j-1][0],p[j][1]-p[j-1][1]);lengths.push(length);}let d=((t+i*.12)%1)*length;for(let j=0;j<lengths.length;j++)if(d<=lengths[j]){const prev=j?lengths[j-1]:0,u=(d-prev)/(lengths[j]-prev);beads[i].position.set(p[j][0]+(p[j+1][0]-p[j][0])*u,p[j][1]+(p[j+1][1]-p[j][1])*u,0);break;}});}
 const reset=()=>{index=1.52;angle=0;dispersion=true;t=0;running=true;refresh();};reset();
 return study(group,{update,reset,needsAnimation:()=>running,controls:[{id:'index',label:'Index at 550 nm',type:'range',min:1.1,max:1.9,step:.01,get:()=>index,set:v=>{index=v;refresh();}},{id:'angle',label:'Incident bench angle (degrees)',type:'range',min:-15,max:15,step:.5,get:()=>angle,set:v=>{angle=v;refresh();}},{id:'dispersion',label:'White-light / monochromatic study',type:'button',set:()=>{dispersion=!dispersion;refresh();}},{id:'run',label:'Play / pause direction markers',type:'button',set:()=>running=!running}],stats:()=>[{label:'Reference index',value:index.toFixed(2)},{label:'Central ray',value:traces[2].events.join(' → ')||'Miss'},{label:'Dispersion',value:dispersion?'Authored Cauchy family':'Off'}],views:{overview:{position:[2.1,2.8,10.8],target:[.25,-.15,0]},detail:{position:[1.4,1.5,6.4],target:[0,0,0]}},note:'A planar Snell/TIR ray trace intersects the same triangular faces drawn in the scene. Optional dispersion uses an authored Cauchy-like index n(λ)=n550+0.007[(550/λ)²−1], not a measured glass. Colored paths and moving markers indicate ray direction; brightness and speed are not optical power or light speed. Fresnel splitting and absorption are omitted.',sources:[{title:'OpenStax University Physics 3 — Total internal reflection',url:'https://openstax.org/books/university-physics-volume-3/pages/1-4-total-internal-reflection'}]});
}
