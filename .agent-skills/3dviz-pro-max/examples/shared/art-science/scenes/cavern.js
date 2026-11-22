import {THREE,mat,mesh,sphere,tube,cylinderBetween} from '../scene-kit.js';
import {create as createRocks} from '../kits/nature/rock-cluster.js';
import {strand,parametric} from '../study-kit.js';
import {addConservatoryCraft,waterNormal} from './conservatory-craft.js';
import {seeded} from '../kits/kit-core.js';
function crystalGeometry(){
 const profile=[[.12,0],[.24,.06],[.25,.7],[.22,.8],[0,1.05]].map(([x,y])=>new THREE.Vector2(x,y));
 const g=new THREE.LatheGeometry(profile,6).toNonIndexed();g.computeVertexNormals();return g;
}
function gardenTexture(){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d'),r=seeded(63);
 c.fillStyle='#517a6b';c.fillRect(0,0,256,256);for(let i=0;i<1800;i++){c.fillStyle=`rgba(${110+Math.floor(r()*45)},${135+Math.floor(r()*50)},130,.18)`;c.fillRect(r()*256,r()*256,1+r()*4,1+r()*4);}
 const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(4,4);return t;
}
export function createScene(){
 const group=new THREE.Group(),r=seeded(731),stone=mat('#3a4e51',.88,.05),dark=mat('#203b38',.9),brass=mat('#bfa46c',.28,.72);
 const earth=mesh(new THREE.CylinderGeometry(3.2,2.85,.5,84),dark,[0,-1.85,0],group);
 const ground=parametric((u,v)=>{const a=u*Math.PI*2,r=v*3.2,x=r*Math.cos(a),z=r*Math.sin(a),pondDistance=((x-.2)/1.85)**2+((z-.5)/1.22)**2,bank=Math.max(0,Math.min(1,(pondDistance-1)*.6));return[x,-1.57+bank*(.04+.13*Math.sin(x*2+z)**2),z];},96,28);
 const soil=mesh(ground,mat('#456f57',.95,0,{map:gardenTexture()}),[0,0,0],group);
 const rocks=createRocks({count:11,spread:1.3,seed:31,rock:'#3c5360'});rocks.group.scale.set(2.15,1.7,1.2);rocks.group.position.set(.15,-1.52,-1.75);group.add(rocks.group);
 const geology=new THREE.Group();group.add(geology);for(let i=0;i<14;i++){
  const a=.05+i/13*Math.PI,b=2.7+Math.sin(i*7)*.15,h=1.2+Math.sin(i*.37)*1.6;
  const column=mesh(new THREE.CylinderGeometry(.31,.52,h,6,1),stone,[Math.cos(a)*b,h/2-1.57,-Math.sin(a)*b],geology);column.rotation.y=i*.7;
  const band=mesh(new THREE.CylinderGeometry(.33,.33,.025,6),mat('#71867a',.6,.12),[column.position.x,h*.68-1.57,column.position.z],geology);band.rotation.y=column.rotation.y;
 }
 // The two asymmetrical ribs frame the opening without an enclosing wall hiding the garden.
 for(const x of [-2.5,2.3]){strand([[x,-1.5,-.4],[x*.95,.1,-.8],[x*.7,1.7,-1.2],[x*.35,2.2,-1.65]],.28,stone,geology,.025);strand([[x*.82,1,-1],[x*.98,1.6,-1.4],[x*1.02,1.9,-1.8]],.11,stone,geology,.015);}
 const waterMap=waterNormal(),craft=addConservatoryCraft(group);
 const pond=mesh(new THREE.CircleGeometry(1,90),mat('#287b7f',.27,.12,{normalMap:waterMap,normalScale:new THREE.Vector2(.25,.25),transparent:false}),[.2,-1.501,.5],group);pond.rotation.x=-Math.PI/2;pond.scale.set(1.58,1.0,1);
 const bankGeometry=new THREE.IcosahedronGeometry(.15,1),bankMaterial=mat('#8b9b88',.83);
 const bank=new THREE.InstancedMesh(bankGeometry,bankMaterial,46),dummy=new THREE.Object3D();
 for(let i=0;i<46;i++){const a=i/46*Math.PI*2;dummy.position.set(.2+1.7*Math.cos(a),-1.47,.5+1.08*Math.sin(a));dummy.scale.set(1.1+r()*.65,.7+r()*.7,.8+r());dummy.rotation.set(r(),r()*3,r());dummy.updateMatrix();bank.setMatrixAt(i,dummy.matrix);}bank.castShadow=bank.receiveShadow=true;group.add(bank);
 const crystals=new THREE.Group(),cg=crystalGeometry(),crystalMaterials=['#58bfae','#498ca1','#9a78b7'].map(color=>mat(color,.15,.26,{emissive:color,emissiveIntensity:.15}));group.add(crystals);
 for(let i=0;i<27;i++){
  const cluster=i<12?[-1.3,-.9]:i<22?[1.7,-1]:[2.3,1.4],x=cluster[0]+(r()-.5)*.9,z=cluster[1]+(r()-.5)*.7,h=.65+r()*1.6;
  const shard=mesh(cg,crystalMaterials[i%3],[x,-1.45,z],crystals);shard.scale.set(.65+r()*.8,h,.65+r()*.8);shard.rotation.set((r()-.5)*.4,r()*6,(r()-.5)*.6);
  // Fine mineral bands have the same axis and local placement as the parent shard.
  for(const y of [.17,.32,.5]){const band=mesh(new THREE.TorusGeometry(.247,.003,3,6),brass,[0,y,0],shard);band.rotation.x=Math.PI/2;}
 }
 const bridge=new THREE.Group();bridge.position.set(-.45,-1.25,1.0);bridge.rotation.y=-.38;group.add(bridge);
 for(let i=0;i<12;i++){
  const x=(i-5.5)*.14,y=.21*Math.cos(x*1.6);mesh(new THREE.BoxGeometry(.133,.07,.5),mat(i%2?'#a8ac91':'#8d9b8c',.8),[x,y,0],bridge);
  if(i%3===0)for(const z of [-.27,.27]){cylinderBetween([x,y,z],[x,y+.35,z],.018,brass,bridge);sphere([x,y+.36,z],.04,brass,bridge);}
 }
 for(const z of [-.27,.27])tube([[-.8,.43,z],[-.4,.54,z],[0,.58,z],[.4,.54,z],[.8,.43,z]],.014,brass,bridge,30);
 const mushroomCaps=new THREE.InstancedMesh(new THREE.SphereGeometry(1,20,12,0,Math.PI*2,0,Math.PI*.53),mat('#8fbdba',.35,0,{emissive:'#78bdb4',emissiveIntensity:.22}),45);
 const mushroomStems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.018,.025,1,8),mat('#bbccac',.66),45);
 for(let i=0;i<45;i++){const a=r()*Math.PI*2,rad=2.1+r()*.8,x=Math.cos(a)*rad,z=Math.sin(a)*rad,h=.13+r()*.35;dummy.position.set(x,-1.5+h,z);dummy.scale.set(h*.42,h*.2,h*.42);dummy.rotation.set(0,r()*6,0);dummy.updateMatrix();mushroomCaps.setMatrixAt(i,dummy.matrix);dummy.position.y=-1.5+h/2;dummy.scale.set(1,h,1);dummy.updateMatrix();mushroomStems.setMatrixAt(i,dummy.matrix);}group.add(mushroomCaps,mushroomStems);
 const petals=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,6),mat('#568a72',.85),160);
 for(let i=0;i<160;i++){const a=r()*Math.PI*2,rad=2+r()*1.0;dummy.position.set(Math.cos(a)*rad,-1.52+ r()*.15,Math.sin(a)*rad);dummy.scale.set(.04,.16+r()*.1,.035);dummy.rotation.set((r()-.5)*1.5,r()*6,(r()-.5)*1.5);dummy.updateMatrix();petals.setMatrixAt(i,dummy.matrix);}group.add(petals);
 const creature=new THREE.Group(),skin=mat('#ddc5c3',.36),fins=mat('#c28fb6',.4,0,{side:THREE.DoubleSide});group.add(creature);
 sphere([0,0,0],.15,skin,creature,[1.4,.58,.6]);sphere([.17,.02,0],.115,skin,creature,[1,.75,1.25]);
 const tail=tube([[-.12,0,0],[-.24,.015,0],[-.36,.08,.03]],.035,fins,creature,24);
 for(const side of [-1,1]){
  sphere([.23,.067,side*.062],.022,mat('#182e32',.16),creature);
  for(let i=0;i<3;i++)tube([[.13-i*.035,.015,side*.08],[.1-i*.045,.08,side*.15],[.12-i*.05,.12,side*.2]],.01,fins,creature,12);
  for(const x of [-.08,.06])tube([[x,-.02,side*.06],[x+.04,-.055,side*.15],[x+.09,-.06,side*.18]],.013,skin,creature,12);
 }
 const motes=new THREE.BufferGeometry(),points=new Float32Array(60*3);for(let i=0;i<60;i++){points[i*3]=(r()-.5)*5;points[i*3+1]=r()*2.5-1.3;points[i*3+2]=(r()-.5)*4;}
 motes.setAttribute('position',new THREE.BufferAttribute(points,3));const lights=new THREE.Points(motes,new THREE.PointsMaterial({color:'#d4e9b4',size:.025,transparent:true,opacity:.65,depthWrite:false}));group.add(lights);
 creature.scale.setScalar(1.55);
 let t=0,glow=.35,speed=.65,open=true;
 function update(dt){t+=dt*speed;craft.update(t);waterMap.offset.set(t*.018,t*.009);creature.position.set(.2+Math.cos(t*.45)*1.1,-1.405+Math.sin(t*2)*.008,.5+Math.sin(t*.45)*.58);creature.rotation.y=-Math.atan2(.58*Math.cos(t*.45),-1.1*Math.sin(t*.45));tail.rotation.y=Math.sin(t*4)*.3;lights.rotation.y=t*.02;crystalMaterials.forEach((m,i)=>m.emissiveIntensity=glow*(.8+.2*Math.sin(t+i)));geology.visible=open;}
 return {group,update,needsAnimation:()=>speed>0,lighting:{exposure:.76,key:4.5,fill:1.5,rim:8,environment:.18,contact:.3,keyColor:'#b8dbde',fillColor:'#829fae'},reset(){t=0;glow=.35;speed=.65;open=true;update(0);},controls:[{id:'crystal-glow',label:'Crystal luminescence',type:'range',min:0,max:1,step:.01,get:()=>glow,set:v=>glow=v},{id:'garden-pace',label:'Garden pace',type:'range',min:0,max:1.5,step:.05,get:()=>speed,set:v=>speed=v},{id:'cave-frame',label:'Reveal / hide the stone canopy',type:'button',set:()=>{open=!open;}}],stats:()=>[{label:'Crystal garden',value:'27 shards'},{label:'Resident',value:'Moon axolotl + silk moth'},{label:'World',value:'Imagined'}],views:{overview:{position:[6.4,4.3,8.7],target:[0,.05,0]},detail:{position:[3.6,1.3,4.7],target:[.15,-.8,.15]}},stage:false,note:'A fictional subterranean conservatory. The axolotl follows a bounded path entirely within the pond; the surface is stylized water, not a fluid solver.',craft:'Authored crystal garden, masonry portal, botanical geometry, bridge, axolotl and silk moth. Background rock clusters reuse a kit; leaves, mushrooms and bank stones are instanced. The opaque pond retains its surface while a small repeating normal map moves across it. Material and geometry quality are chosen by the object, independently of Blender availability.',sources:[]};
}
