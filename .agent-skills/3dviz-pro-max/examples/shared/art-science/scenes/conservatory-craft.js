import {THREE,mat,mesh,sphere,tube,line} from '../scene-kit.js';
import {parametric,ring,TAU} from '../study-kit.js';
export function addConservatoryCraft(group){
 const stone=mat('#597779',.85),gold=mat('#d1af77',.32,.65),jade=mat('#82bbaa',.45,.12),rose=mat('#d4b4c6',.4,.05,{side:THREE.DoubleSide});
 const arch=new THREE.Group();arch.position.set(.35,-1.52,-1.55);group.add(arch);
 // Individually seated voussoirs give the portal thickness and a readable load-bearing arch.
 for(let i=0;i<17;i++){const a=Math.PI*i/16,block=mesh(new THREE.BoxGeometry(.29,.36,.4),stone,[1.14*Math.cos(a),1.3+1.14*Math.sin(a),0],arch);block.rotation.z=a-Math.PI/2;}
 for(const x of [-1.14,1.14]){mesh(new THREE.CylinderGeometry(.13,.19,1.3,10),stone,[x,.65,0],arch);for(const y of [.09,.25,1.12,1.25])mesh(new THREE.CylinderGeometry(.18,.18,.045,10),gold,[x,y,0],arch);}
 for(const z of [-.22,.22])tube(Array.from({length:81},(_,i)=>{const a=i/80*Math.PI;return[1.15*Math.cos(a),1.3+1.15*Math.sin(a),z];}),.025,gold,arch,80);
 const medallion=ring(.21,.024,gold,arch,[0,2.5,.26]);sphere([0,2.5,.26],.105,mat('#bce3d1',.15,.2,{emissive:'#83bea2',emissiveIntensity:.3}),arch);
 for(const side of [-1,1]){const x=side*1.15;for(let i=0;i<4;i++){const y=.3+i*.23;tube([[x,y,.22],[x+side*.13,y+.12,.24],[x,y+.23,.22]],.015,jade,arch,14);}}
 const plants=new THREE.Group();group.add(plants);const fernMat=mat('#548c78',.7,0,{side:THREE.DoubleSide});
 const leafGeo=parametric((u,v)=>{const x=(v-.5)*.16*Math.sin(Math.PI*u),y=u*.5,z=.1*Math.sin(Math.PI*u)+.035*Math.abs(v-.5);return[x,y,z];},16,6);
 const leaves=new THREE.InstancedMesh(leafGeo,fernMat,240),dummy=new THREE.Object3D();let count=0;
 for(let i=0;i<12;i++){const a=i/12*TAU,r=2.45,x=Math.cos(a)*r,z=Math.sin(a)*r;
  for(let j=0;j<5;j++){const angle=j/5*TAU;for(let k=0;k<4;k++){dummy.position.set(x+Math.sin(angle)*k*.07,-1.46+k*.08,z+Math.cos(angle)*k*.07);dummy.rotation.set(.4+ k*.1,angle,(k%2?1:-1)*.3);dummy.scale.setScalar(.6+k*.09);dummy.updateMatrix();leaves.setMatrixAt(count++,dummy.matrix);}}
 }leaves.count=count;plants.add(leaves);
 for(const [x,z,h] of [[-2.2,.3,.8],[1.7,1.6,.65],[-.6,-2.3,.95]]){
  tube([[x,-1.5,z],[x+.1,-1.1,z],[x,-1.5+h,z]],.022,jade,plants,24);sphere([x,-1.5+h,z],.09,gold,plants);
  for(let j=0;j<6;j++){const petal=mesh(parametric((u,v)=>{const angle=(v-.5)*1.4,r=.32*Math.sin(Math.PI*u);return[r*Math.sin(angle),u*.22,r*Math.cos(angle)];},18,8),rose,[x,-1.5+h,z],plants);petal.rotation.y=j/6*TAU;petal.rotation.x=.35;}
 }
 const moth=new THREE.Group();group.add(moth);sphere([0,0,0],.06,gold,moth,[.45,1,.5]);const wings=[];
 for(const side of [-1,1]){const wing=new THREE.Group();moth.add(wing);const g=parametric((u,v)=>{const a=(u-.5)*2.5,r=Math.sin(Math.PI*v)*.32;return[side*(.025+r*Math.cos(a)),r*Math.sin(a),.025*Math.sin(v*Math.PI)];},24,12);mesh(g,mat('#b9ddc6',.5,0,{side:THREE.DoubleSide}),[0,0,0],wing);wings.push(wing);for(let i=0;i<4;i++)line([[0,0,.005],[side*(.08+i*.035),.1-i*.07,.025]],'#739786',wing,.7);}
 return{update(t){moth.position.set(.2+Math.sin(t*.32)*.62,-.38+Math.sin(t*.9)*.08,.8+Math.cos(t*.32)*.24);moth.rotation.y=Math.cos(t*.32)*.3;wings.forEach((w,i)=>w.rotation.y=(i?1:-1)*(.3+Math.sin(t*9)*.48));},plants};
}
export function waterNormal(){
 const n=128,c=document.createElement('canvas');c.width=c.height=n;const ctx=c.getContext('2d'),image=ctx.createImageData(n,n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){const u=x/n*TAU,v=y/n*TAU,dx=.23*Math.cos(3*u+2*v)+.09*Math.cos(7*u-4*v),dy=.15*Math.cos(3*u+2*v)-.12*Math.cos(7*u-4*v),l=Math.hypot(dx,dy,1),i=(y*n+x)*4;image.data.set([128+127*dx/l,128+127*dy/l,128+127/l,255],i);}
 ctx.putImageData(image,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);return t;
}
