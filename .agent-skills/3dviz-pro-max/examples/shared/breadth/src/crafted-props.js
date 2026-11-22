import {THREE,TAU,add,box,ell,rod,curve,ring,palette,material,finish} from './craft-forms.js';
export function lantern(){
 const g=new THREE.Group(),m=palette();add(g,new THREE.CylinderGeometry(.33,.39,.1,8),m.iron,[0,.06,0]);add(g,new THREE.CylinderGeometry(.27,.33,.12,8),m.gold,[0,.16,0]);
 const glass=new THREE.MeshPhysicalMaterial({color:'#e0b369',roughness:.24,metalness:0,transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide});
 add(g,new THREE.CylinderGeometry(.25,.25,.75,8,1,true),glass,[0,.59,0]);
 for(let i=0;i<8;i++){const a=i/8*TAU;rod(g,m.iron,[.265*Math.sin(a),.19,.265*Math.cos(a)],[.265*Math.sin(a),1,.265*Math.cos(a)],.018);
  for(const y of [.23,.92])ell(g,m.gold,[.271*Math.sin(a),y,.271*Math.cos(a)],[.026,.026,.026]);}
 add(g,new THREE.CylinderGeometry(.1,.35,.24,8),m.iron,[0,1.09,0]);add(g,new THREE.CylinderGeometry(.09,.09,.14,16),m.gold,[0,1.28,0]);
 const handle=ring(g,m.iron,[0,1.49,0],.16,.024);handle.scale.y=1.18;
 add(g,new THREE.CylinderGeometry(.09,.11,.16,32),m.cream,[0,.28,0]);const flame=ell(g,material('#ffc46e',.4),[0,.43,0],[.042,.12,.042]);flame.material.emissive.set('#ff9b32');flame.material.emissiveIntensity=1;
 for(let i=0;i<4;i++){const a=i/4*TAU;const fil=new THREE.Group();fil.rotation.y=a;g.add(fil);curve(fil,m.gold,[[-.11,.3,.252],[-.15,.47,.252],[0,.67,.252],[.15,.47,.252],[.11,.3,.252]],.009);}
 let t=0;return finish(g,{title:'The Lamplighter’s Lantern',description:'An octagonal iron lantern with brass rivets, scrollwork, thin amber glazing and a sheltered candle. The flame flicker is restrained; brightness does not erase the metalwork.',motion:dt=>{t+=dt;flame.scale.y=.12*(1+.055*Math.sin(t*4.3));}});
}
export function well(){
 const g=new THREE.Group(),m=palette(),water=material('#286169',.2,.2);
 for(let row=0;row<4;row++)for(let i=0;i<18;i++){const a=(i+row%2*.5)/18*TAU,r=.61;const b=box(g,row%2?m.stone:m.cream,[r*Math.sin(a),.1+row*.18,r*Math.cos(a)],[.22,.16,.23]);b.rotation.y=a;}
 add(g,new THREE.CylinderGeometry(.5,.5,.015,64),water,[0,.23,0]);
 for(const x of [-.85,.85]){box(g,m.wood,[x,.83,0],[.12,1.65,.15]);box(g,m.stone,[x,.08,0],[.27,.16,.31]);}
 rod(g,m.wood,[-.92,1.34,0],[.92,1.34,0],.071);
 for(let i=0;i<18;i++){const rope=ring(g,m.cream,[-.2+i*.025,1.34,0],.082,.012);rope.rotation.y=Math.PI/2;}
 rod(g,m.cream,[0,1.34,.083],[0,.82,.083],.015);const bucket=new THREE.Group();bucket.position.set(0,.7,.083);g.add(bucket);add(bucket,new THREE.CylinderGeometry(.12,.095,.22,16,1,true),m.wood);add(bucket,new THREE.CylinderGeometry(.095,.095,.015,16),m.wood,[0,-.103,0]);
 for(const y of [-.08,.08]){const r=ring(bucket,m.iron,[0,y,0],y>0?.12:.10,.01);r.rotation.x=Math.PI/2;}
 const handle=ring(bucket,m.iron,[0,.15,0],.115,.008);handle.scale.y=.8;
 for(const s of [-1,1]){const r=box(g,m.roof,[s*.48,1.8,0],[1.1,.09,1.45]);r.rotation.z=-s*.35;
  for(let j=0;j<9;j++)rod(g,m.gold,[s*.05,1.97,-.64+j*.16],[s*.98,1.64,-.64+j*.16],.008);}
 rod(g,m.wood,[-1,1.35,0],[-1,1.08,0],.023);rod(g,m.wood,[-1,1.08,0],[-1.18,1.08,0],.025);
 return finish(g,{title:'The Wishing Well',description:'Staggered masonry surrounds a visible water surface. A rope coil, open timber bucket, metal hoops and supported pitched roof make the mechanism readable from above and beside it.'});
}
export function tree(){
 const g=new THREE.Group(),m=palette(),bark=material('#665346',.88),leaves=[material('#4b705e',.8),material('#8caa76',.77),material('#bdad6b',.73)];
 curve(g,bark,[[0,0,0],[-.1,.45,.02],[.04,1,0],[-.12,1.6,.05],[0,2.2,0]],.13);
 for(let i=0;i<8;i++){const a=i/8*TAU;curve(g,bark,[[0,.14,0],[Math.sin(a)*.23,.06,Math.cos(a)*.23],[Math.sin(a)*.5,.015,Math.cos(a)*.5]],.04);}
 const clusters=[];
 for(let branch=0;branch<11;branch++){
  const a=branch*2.399,reach=.5+(branch%3)*.13,y=1.25+branch*.076;
  const end=[Math.sin(a)*reach,y+.34,Math.cos(a)*reach];curve(g,bark,[[0,y-.5,0],[end[0]*.52,y+.02,end[2]*.52],end],.036);
  for(let twig=0;twig<3;twig++){const at=[end[0]+Math.sin(a+twig*2)*.22,end[1]+twig*.07,end[2]+Math.cos(a+twig*2)*.22];rod(g,bark,end,at,.009);
   clusters.push(at);}
 }
 // Directional leaves reveal branching and negative spaces rather than spherical foliage blobs.
 const count=clusters.length*26,geo=new THREE.SphereGeometry(1,7,5),d=new THREE.Object3D();
 for(let shade=0;shade<3;shade++){const inst=new THREE.InstancedMesh(geo,leaves[shade],Math.ceil(count/3));let k=0;
  for(let i=shade;i<count;i+=3){const c=clusters[Math.floor(i/26)],a=i*2.399,v=(i%26)/26;d.position.set(c[0]+Math.cos(a)*.22*Math.sqrt(v),c[1]+Math.sin(i*3.4)*.12,c[2]+Math.sin(a)*.22*Math.sqrt(v));d.rotation.set(i*.31,i*.67,i*.4);d.scale.set(.075,.014,.035);d.updateMatrix();inst.setMatrixAt(k++,d.matrix);}inst.count=k;inst.castShadow=inst.receiveShadow=true;g.add(inst);}
 for(let i=0;i<14;i++){const a=i*2.4;ell(g,m.stone,[Math.cos(a)*(.28+i*.018),.027,Math.sin(a)*(.28+i*.018)],[.09,.035,.06]);}
 return finish(g,{title:'The Windwritten Tree',description:'A branching tree study with exposed roots, fine twigs and individually oriented leaves. Open canopy gaps reveal the structure and let light distinguish leaf, bark and stone.'});
}
