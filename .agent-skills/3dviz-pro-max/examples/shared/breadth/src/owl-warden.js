import {THREE,material,ell,rod,curve,ring,feather,finish} from './craft-forms.js';

function plumage(base,ink){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
 const c=canvas.getContext('2d');c.fillStyle=base;c.fillRect(0,0,512,512);
 // Directional barb marks and irregular transverse barring; authored, not a species plumage map.
 for(let i=0;i<420;i++){
  const y=i*31%512,x=i*79%512;c.strokeStyle=ink;c.globalAlpha=.12+(i%5)*.025;c.lineWidth=.5+(i%3)*.4;
  c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+16,y-7,x+39,y-24);c.stroke();
 }
 for(let j=0;j<7;j++){c.globalAlpha=.13;c.fillStyle=ink;c.beginPath();c.moveTo(0,j*81+9);for(let x=0;x<=512;x+=16)c.lineTo(x,j*81+14+Math.sin(x*.04+j)*9);c.lineTo(512,j*81+29);c.lineTo(0,j*81+23);c.fill();}
 c.globalAlpha=1;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
 return texture;
}

export function owlWarden(){
 const g=new THREE.Group();
 const slate=material('#788c89',.91),buff=material('#c9c2a6',.94),dark=material('#384943',.87),horn=material('#34362c',.45),gold=material('#9c773d',.4,.68);
 const slateMap=plumage('#81928b','#263f3b'),buffMap=plumage('#d4cbb1','#827a63');
 for(const [m,map] of [[slate,slateMap],[buff,buffMap],[dark,slateMap]]){m.map=map;m.bumpMap=map;m.bumpScale=.0015;}
 const body=ell(g,slate,[0,.69,-.018],[.325,.49,.255]);
 const head=new THREE.Group();head.position.set(0,1.115,.015);g.add(head);
 ell(head,slate,[0,0,0],[.32,.265,.242]);
 // The feathered thighs overlap the abdomen; tarsi and toes form a continuous load path to ground.
 for(const side of [-1,1]){
  ell(g,buff,[side*.135,.29,.01],[.096,.21,.095]);
  rod(g,horn,[side*.135,.17,.035],[side*.135,.063,.045],.033,.037);
  for(let i=0;i<5;i++){const band=ring(g,gold,[side*.135,.075+i*.018,.043],.033,.003);band.rotation.x=Math.PI/2;}
  for(const forward of [-1,1])for(const toe of [-1,1]){
   const x=side*.135,spread=toe*.049,z=forward*.12;
   curve(g,horn,[[x,.075,.035],[x+spread*.6,.035,.035+z*.55],[x+spread,.028,.035+z]],.017);
   curve(g,gold,[[x+spread,.03,.035+z],[x+spread*1.13,.019,.035+z*1.12],[x+spread*1.15,.008,.035+z*1.2]],.007);
  }
  for(let i=0;i<6;i++)feather(g,buff,[side*.135+(i%3-1)*.042,.36-Math.floor(i/3)*.06,.092],.16,.033,side*.1);
 }
 // Staggered contour feathers follow the ellipsoid and overlap in the direction of growth.
 for(let row=0;row<12;row++){
  const y=.98-row*.052,half=.22*Math.sqrt(Math.max(.16,1-((y-.69)/.45)**2));
  const count=9+(row%2);
  for(let j=0;j<count;j++){
   const x=(j/(count-1)*2-1)*half+(row%2?.004:-.004),q=Math.max(.08,1-(x/.335)**2-((y-.69)/.5)**2),z=-.018+.259*Math.sqrt(q);
   const f=feather(g,buff,[x,y,z+.004],.095+(j%3)*.005,.025+(row%3)*.001,-x*.65);
   f.rotation.x=Math.atan(-.259*(y-.69)/(.25*Math.sqrt(q)))*.65;
  }
 }
 // Side and back coverts continue the feather field around the entire torso.
 for(const side of [-1,1])for(let row=0;row<7;row++)for(let j=0;j<4;j++){
  const angle=side*(.8+j*.47),y=.99-row*.087,r=Math.sqrt(Math.max(.12,1-((y-.69)/.49)**2));
  const f=feather(g,(j+row)%4?slate:dark,[.329*r*Math.sin(angle),y,-.018+.26*r*Math.cos(angle)],.16,.048,0);f.rotation.y=angle;
 }
 const wings=[];
 for(const side of [-1,1]){
  const shoulder=new THREE.Group();shoulder.position.set(side*.263,.98,-.012);g.add(shoulder);
  ell(shoulder,slate,[side*.017,-.15,-.015],[.115,.257,.15]);
  const outer=new THREE.Group();outer.position.set(side*.017,-.23,.012);shoulder.add(outer);
  ell(outer,dark,[side*.025,-.11,-.007],[.086,.17,.085]);
  for(let i=0;i<8;i++){
   const f=feather(outer,i%3?slate:buff,[side*(.015+i*.014),-.015-i*.014,.035-i*.006],.38-i*.013,.043,-side*(.035+i*.035));
   f.rotation.y=side*.26;
  }
  for(let row=0;row<4;row++)for(let j=0;j<3;j++){
   const f=feather(shoulder,(j+row)%4?slate:buff,[side*(j*.036-.007),-.035-row*.063,.13-Math.abs(j-1)*.018],.16,.046,-side*.12);f.rotation.y=side*.25;
  }
  wings.push({shoulder,outer,side});
 }
 for(let i=0;i<7;i++){const f=feather(g,i%2?slate:dark,[(i-3)*.032,.49,-.229],.31,.048,(i-3)*.055);f.rotation.y=Math.PI;f.rotation.x=-.16;}
 // Facial discs are feathered dishes, with inset round pupils and a hooked bill under the brow.
 for(const side of [-1,1]){
  const disk=ell(head,buff,[side*.128,-.015,.185],[.166,.19,.065]);disk.rotation.z=-side*.13;
  for(let i=0;i<26;i++){
   const a=i/26*Math.PI*2,px=side*.128+Math.cos(a)*.154,py=-.015+Math.sin(a)*.176;
   const f=feather(head,buff,[px,py,.207],.039,.012,a-Math.PI/2);f.rotation.y=side*.12;
  }
  ell(head,dark,[side*.128,.013,.238],[.083,.09,.029]);
  const iris=material('#b98b38',.3,.12);ell(head,iris,[side*.128,.015,.261],[.054,.059,.021]);
  const pupil=material('#101819',.14);ell(head,pupil,[side*.128,.017,.279],[.029,.034,.013]);
  ell(head,material('#ddd9c3',.22),[side*.113,.033,.289],[.009,.011,.004]);
  for(let i=0;i<4;i++){
   const f=feather(head,slate,[side*(.061+i*.033),.131+i*.002,.245],.047,.019,-side*(.3+i*.05));f.rotation.x=-.1;
  }
  // These are feather tufts, not fleshy ears.
  for(let i=0;i<5;i++){
   const f=feather(head,i%2?slate:dark,[side*(.21+i*.013),.17,-.025+i*.011],.16+(i%3)*.027,.03,Math.PI-side*(.22+i*.07));f.rotation.x=.1;
  }
 }
 const beakGeometry=new THREE.BufferGeometry();
 beakGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.039,-.012,.24,.039,-.012,.24,0,-.035,.307,-.027,-.072,.255,.027,-.072,.255,0,-.13,.275],3));
 beakGeometry.setIndex([0,1,2,0,2,3,1,4,2,2,4,5,2,5,3,0,3,4,0,4,1,3,5,4]);beakGeometry.computeVertexNormals();const beakMaterial=horn.clone();beakMaterial.side=THREE.DoubleSide;const beak=new THREE.Mesh(beakGeometry,beakMaterial);beak.castShadow=true;head.add(beak);
 
 // A small worn seal keeps the fantasy identity without severing the neck with a floating collar.
 const seal=ell(g,gold,[0,.805,.253],[.04,.049,.014]);
 ell(g,material('#397773',.28,.25),[0,.805,.268],[.023,.031,.008]);
 let time=0,spread=.15,auto=true;
 const pose=()=>{const amount=auto?.15+.2*(.5+.5*Math.sin(time*.6))**4:spread;for(const {shoulder,outer,side} of wings){shoulder.rotation.z=side*amount;outer.rotation.z=side*amount*.3;}head.rotation.y=Math.sin(time*.42)*.1;head.rotation.z=Math.sin(time*.31)*.018;};
 pose();
 const result=finish(g,{title:'The Archive Warden',description:'A feathered owl spirit with a continuous shoulder-to-wing structure, overlapping contour plumage, feathered legs and grounded talons. Facial discs, round amber eyes and short feather tufts establish its owl identity. A restrained wing stretch is authored motion, not flight.',motion:dt=>{time+=dt;pose();}});
 result.bind=(panel,invalidate)=>{
  const label=document.createElement('label');label.textContent='Wing spread · manual pose (degrees)';const input=document.createElement('input');input.type='range';input.min=0;input.max=28;input.step=1;input.value=Math.round(spread*180/Math.PI);input.setAttribute('aria-label','Wing spread');label.append(input);panel.append(label);
  input.oninput=()=>{auto=false;spread=Number(input.value)*Math.PI/180;pose();invalidate();};
  const button=document.createElement('button');button.textContent='Use automatic wing pose';button.onclick=()=>{auto=true;pose();invalidate();};panel.append(button);
 };
 result.sources=[{title:'Cornell Lab — Owl body plan and facial discs',url:'https://www.allaboutbirds.org/guide/Great_Horned_Owl/id'},{title:'Cornell Lab — Feather structure',url:'https://academy.allaboutbirds.org/features/all-about-feathers/how-feathers-are-built.php'}];
 result.note='An invented owl spirit informed by owl structure, not a species reconstruction. Feather patterns, counts and wing poses are authored. No aerodynamics or feather-contact solver is present.';
 return result;
}
