import {THREE,TAU,material,ell,rod,curve,ring,feather,finish} from './craft-forms.js';
export function moonStag(){
 const g=new THREE.Group(),ivory=material('#c9c9ad',.77),mane=material('#879e91',.78),dark=material('#263c39',.32),gold=material('#b89756',.33,.65),horn=material('#e0cf9e',.53),black=material('#091c20',.12);
 const torso=ell(g,ivory,[0,.92,0],[.28,.34,.58]);ell(g,mane,[0,1.06,.36],[.245,.38,.25]);
 const neck=new THREE.Group();neck.position.set(0,1.04,.42);g.add(neck);
 ell(neck,ivory,[0,.23,.02],[.17,.35,.18]);
 const head=new THREE.Group();head.position.set(0,.48,.1);neck.add(head);
 ell(head,ivory,[0,0,.04],[.16,.19,.25]);ell(head,mane,[0,-.07,.22],[.115,.1,.19]);ell(head,dark,[0,-.045,.365],[.089,.055,.06]);
 for(const side of [-1,1]){
  const ear=ell(head,ivory,[side*.225,.14,-.04],[.08,.19,.046]);ear.rotation.z=-side*.72;
  const inner=ell(head,mane,[side*.228,.145,-.012],[.044,.135,.018]);inner.rotation.z=-side*.72;
  ell(head,dark,[side*.137,.035,.13],[.024,.036,.034]);ell(head,black,[side*.152,.039,.145],[.012,.021,.025]);
  ell(head,horn,[side*.158,.05,.16],[.004,.006,.007]);
  const spine=[[side*.1,.15,-.05],[side*.16,.38,-.13],[side*.3,.6,-.18],[side*.39,.8,-.12],[side*.43,.92,-.03]];
  curve(head,horn,spine,.027);
  for(const [a,b,c] of [[[.16,.37,-.12],[.23,.54,.06],[.29,.66,.08]],[[.29,.57,-.17],[.46,.64,-.22],[.59,.77,-.16]],[[.37,.75,-.14],[.28,.88,-.2],[.26,1.01,-.15]]])
   curve(head,horn,[a,b,c].map(p=>[side*p[0],p[1],p[2]]),.014);
  for(const z of [-.37,.34]){
   const hip=[side*.18,.85,z],knee=[side*.2,.43,z+(z<0?.1:-.025)],ankle=[side*.21,.12,z+(z<0?-.02:.03)];
   ell(g,ivory,hip,[.095,.22,.13]);
   for(const [a,b,r] of [[hip,knee,.06],[knee,ankle,.033]]){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b),delta=bv.clone().sub(av);const limb=ell(g,ivory,av.add(bv).multiplyScalar(.5).toArray(),[r,delta.length()*.62,r]);limb.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}
   ell(g,mane,knee,[.042,.054,.044]);
   for(const split of [-1,1])ell(g,dark,[ankle[0]+split*.023,.055,ankle[2]+.035],[.023,.052,.065]);
  }
  for(let i=0;i<26;i++){const y=.84+(i%5)*.075,z=-.43+Math.floor(i/5)*.16;ell(g,horn,[side*(.237+.02*Math.sin(i)),y,z],[.015,.013,.024]);}
 }
 // Shoulder contours and tapered mane follow the body plan instead of a repeated bead silhouette.
 for(const side of [-1,1]){
  ell(g,ivory,[side*.19,.98,.29],[.11,.23,.16]);
  for(let i=0;i<9;i++){
   const tuft=feather(neck,mane,[side*(.045+i*.006),.32-i*.04,.16],.16,.028,side*(.13+i*.04));
   tuft.rotation.y=side*.3;
  }
  for(const z of [-.34,.37])ell(g,ivory,[side*.2,.19,z],[.04,.07,.038]);
 }
 // Layered throat tufts follow the neck instead of floating on a separately animated root.
 for(let i=0;i<11;i++)ell(neck,mane,[0,-.1+i*.045,.12],[.13-i*.004,.065,.08]);
 const collar=ring(neck,gold,[0,.15,.01],.172,.014);collar.rotation.x=Math.PI/2;
 ell(neck,gold,[0,.13,.19],[.045,.055,.015]);ell(neck,material('#65b0a7',.18,.35),[0,.13,.205],[.027,.036,.012]);
 const tail=new THREE.Group();tail.position.set(0,1.05,-.48);g.add(tail);curve(tail,mane,[[0,0,0],[0,.04,-.15],[0,-.03,-.25]],.063);
 let t=0;return finish(g,{title:'The Moonwood Stag',description:'A watchful forest spirit: branching antlers, split hooves, a layered throat mane and a patinated ceremonial collar. A quiet head turn and breathing pose keep its feet planted.',motion:dt=>{t+=dt;head.rotation.y=Math.sin(t*.6)*.12;neck.rotation.x=Math.sin(t*.85)*.025;torso.scale.y=.34*(1+.012*Math.sin(t*1.7));tail.rotation.y=Math.sin(t*1.1)*.16;}});
}
export {owlWarden} from './owl-warden.js';
