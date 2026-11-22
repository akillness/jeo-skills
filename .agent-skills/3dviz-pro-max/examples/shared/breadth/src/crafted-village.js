import {THREE,TAU,add,box,ell,rod,ring,curve,palette,material,finish} from './craft-forms.js';
import {house,tower,market} from './crafted-architecture.js';
import {tree,well} from './crafted-props.js';
import {addNightFixtures} from './night-fixtures.js';
import {moonStag,owlWarden} from './crafted-creatures.js';
export function village(){
 const g=new THREE.Group(),m=palette(),earth=material('#536b5b',.95),soil=material('#4f5548',.92),path=material('#ad9f83',.9),water=material('#487e81',.23,.23);
 water.name='pond-water';
 const owned=[],creatures=[];
 function place(study,p,scale=1,yaw=0){
  owned.push(study);const root=study.subject;root.removeFromParent();root.scale.setScalar(scale);root.position.set(...p);root.rotation.y=yaw;g.add(root);return root;
 }
 const island=add(g,new THREE.CylinderGeometry(4.7,4.35,.65,96),soil,[0,-.35,0],[1,1,.82]);
 add(g,new THREE.CylinderGeometry(4.72,4.68,.13,96),earth,[0,.025,0],[1,1,.82]);
 for(let i=0;i<43;i++){const a=i/43*TAU;ell(g,i%3?m.stone:soil,[4.5*Math.cos(a),-.25+Math.sin(i)*.13,3.67*Math.sin(a)],[.29,.35,.22]);}
 // Raised gardens provide visible changes in elevation; architecture sits on matching foundations.
 ell(g,earth,[-2.4,.1,-1.5],[1.7,.48,1.3]);ell(g,earth,[2.55,.1,-1.1],[1.55,.35,1.5]);
 const landmarks=[place(house(),[-2.3,.25,-.55],.85,.2),place(tower(),[.2,.1,-2.0],.85),place(house('hall'),[2.3,.2,-1.0],.67,-.4)];
 for(const [x,y,z,s] of [[-2.3,.15,-.55,1],[.2,.08,-2,.8],[2.3,.1,-1,1]])box(g,m.stone,[x,y,z],[s*1.85,.25,s*1.55],.12);
 place(market(),[.25,.12,.25],.6,-.25);place(well(),[-1.3,.12,1.3],.5);
 // Individual inset pavers follow a curved lane instead of a thin floating strip.
 for(let i=0;i<44;i++){const t=i/43,z=-2.7+t*5.5,x=.9*Math.sin(t*5)-.35;
  for(const side of [-1,1]){const b=box(g,path,[x+side*.14,.125,z],[.24,.075,.18],.035);b.rotation.y=.3*Math.cos(t*5);}}
 const pond=add(g,new THREE.CircleGeometry(1.22,64),water,[2.0,.135,1.45]);pond.rotation.x=-Math.PI/2;pond.scale.set(1,.7,1);
 for(let i=0;i<30;i++){const a=i/30*TAU;ell(g,m.stone,[2+1.25*Math.cos(a),.13,1.45+.9*Math.sin(a)],[.15,.085,.12]);}
 for(let i=0;i<5;i++){const pad=add(g,new THREE.CircleGeometry(.1+i*.005,24),m.leaf,[1.45+i*.17,.14,1.6+Math.sin(i)*.16]);pad.rotation.x=-Math.PI/2;}
 const ripples=[];for(let i=0;i<3;i++){const r=ring(g,material('#8eb4b0',.4),[2,.143,1.4],.19+i*.18,.006);r.rotation.x=Math.PI/2;r.scale.y=.65;r.material.transparent=true;r.material.opacity=.4;r.material.depthWrite=false;ripples.push(r);}
 const stream=new THREE.Mesh(new THREE.PlaneGeometry(1,1),water);
 const streamPoints=[[-2.1,.141,1.62],[-1.3,.141,1.9],[-.3,.141,2.2],[.7,.141,2.3],[1.5,.141,1.75]];
 const spline=new THREE.CatmullRomCurve3(streamPoints.map(p=>new THREE.Vector3(...p))),positions=[],indices=[];
 for(let i=0;i<=60;i++){const p=spline.getPoint(i/60),t=spline.getTangent(i/60),n=new THREE.Vector3(-t.z,0,t.x).normalize().multiplyScalar(.13);for(const s of [-1,1])positions.push(p.x+s*n.x,p.y,p.z+s*n.z);if(i<60){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}}
 stream.geometry.dispose();stream.geometry=new THREE.BufferGeometry();stream.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));stream.geometry.setIndex(indices);stream.geometry.computeVertexNormals();g.add(stream);
 // A low arched timber bridge crosses the narrow outflow beside the pond.
 for(let i=0;i<12;i++){const u=i/11;box(g,m.wood,[.6+u*1.1,.18+.15*Math.sin(u*Math.PI),2.0],[.09,.06,.52]);}
 for(const side of [-1,1]){curve(g,m.wood,[[.56,.36,2+side*.29],[1.15,.59,2+side*.29],[1.75,.36,2+side*.29]],.026);for(let i=0;i<4;i++){const u=i/3;rod(g,m.wood,[.6+u*1.1,.19,2+side*.29],[.6+u*1.1,.37+.17*Math.sin(u*Math.PI),2+side*.29],.021);}}
 for(let i=0;i<10;i++){const a=i/10*TAU+.2;place(tree(),[3.8*Math.cos(a),.08,2.85*Math.sin(a)],.4+(i%3)*.09,i*.6);}
 for(let i=0;i<100;i++){const a=i*2.399,r=1.9+(i%13)*.16,x=Math.sin(a)*r,z=Math.cos(a)*r*.77;
  if((x>0.5&&z>0)||Math.abs(x)<.7)continue;for(let j=0;j<3;j++)rod(g,m.leaf,[x,.1,z],[x+Math.sin(i+j)*.035,.23+(j%2)*.07,z+.02*j],.009);}
 const mill=place(house(),[-2.5,.1,1.6],.55,-.22),wheel=new THREE.Group();mill.add(wheel);wheel.position.set(1.09,.65,0);wheel.rotation.z=Math.PI/2;
 for(const side of [-1,1]){const rim=ring(wheel,m.wood,[0,side*.14,0],.59,.047);rim.rotation.x=Math.PI/2;}
 for(let i=0;i<14;i++){const a=i/14*TAU;const paddle=box(wheel,m.wood,[.59*Math.sin(a),0,.59*Math.cos(a)],[.2,.34,.075]);paddle.rotation.y=a;rod(wheel,m.wood,[0,0,0],[.56*Math.sin(a),0,.56*Math.cos(a)],.023);}
 // Structural detail belongs to the joins, banks and mechanisms seen in close-up.
 const hardware=material('#3e4340',.48,.65),reeds=material('#a9aa72',.88);
 for(const side of [-1,1]){
  curve(g,m.wood,[[.56,.155,2+side*.22],[1.15,.29,2+side*.22],[1.75,.155,2+side*.22]],.043);
  for(let i=0;i<4;i++){const u=i/3;ell(g,hardware,[.6+u*1.1,.34+.17*Math.sin(u*Math.PI),2+side*.312],[.012,.012,.008]);}
 }
 for(let i=0;i<22;i++){
  const a=i/22*TAU,x=2+1.31*Math.cos(a),z=1.45+.96*Math.sin(a);
  if(x<1.5&&z>1.8)continue;
  for(let j=0;j<3;j++){const y=.23+(i%4)*.035;curve(g,reeds,[[x,.14,z],[x+.025*j,y,z+.025],[x+.055*j,y+.09,z+.04]],.006);}
 }
 for(let i=0;i<=12;i++){
  const p=spline.getPoint(i/12),tangent=spline.getTangent(i/12),n=new THREE.Vector3(-tangent.z,0,tangent.x).normalize();
  for(const side of [-1,1])ell(g,i%2?m.stone:soil,[p.x+n.x*side*.19,.135,p.z+n.z*side*.19],[.11,.045,.08]);
 }
 rod(wheel,hardware,[0,-.27,0],[0,.27,0],.062);
 for(const side of [-1,1]){const hub=add(wheel,new THREE.CylinderGeometry(.1,.1,.035,16),hardware,[0,side*.18,0]);
  for(let j=0;j<5;j++){const a=j/5*TAU;ell(wheel,m.gold,[Math.sin(a)*.073,side*.203,Math.cos(a)*.073],[.011,.007,.011]);}}
 const stag=moonStag(),owl=owlWarden();place(stag,[-.65,.12,.65],.25,-.65);place(owl,[-.8,.12,-1.5],.3,.7);creatures.push(stag,owl);
 const lighting=addNightFixtures(g);
 let t=0;const result=finish(g,{title:'Copperleaf Hollow',description:'A new village diorama with raised gardens, distinct architecture, curved stone paths, a timber bridge and a persistent pond surface. The mill wheel and restrained ripples are authored motion; this scene is not a hydraulic simulation.',motion:dt=>{t+=dt;creatures.forEach(c=>c.update(dt));wheel.rotation.y=-t*.35;ripples.forEach((r,i)=>r.material.opacity=.15+.13*(1+Math.sin(t*1.2+i)));}});
 result.night=lighting;
 const dispose=result.dispose;result.dispose=()=>{dispose();owned.forEach(s=>s.dispose());};return result;
}
