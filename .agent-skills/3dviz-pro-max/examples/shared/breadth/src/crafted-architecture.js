import {THREE,TAU,add,box,ell,rod,curve,ring,palette,material,finish} from './craft-forms.js';
function pane(g,m,x,y,z,w=.35,h=.55){
 box(g,m.iron,[x,y,z-.008],[w,h,.025]);for(const s of [-1,1]){box(g,m.wood,[x+s*(w+.04)/2,y,z],[.055,h+.1,.075]);box(g,m.wood,[x,y+s*(h+.04)/2,z],[w+.1,.055,.075]);}box(g,m.glass,[x,y,z+.046],[w,h,.025]);
 for(const s of [-1,1])rod(g,m.gold,[x+s*w*.42,y-h*.45,z+.065],[x-s*w*.42,y+h*.45,z+.065],.009);
 rod(g,m.wood,[x,y-h*.5,z+.07],[x,y+h*.5,z+.07],.014);
 box(g,m.stone,[x,y-h*.5-.06,z+.045],[w+.2,.08,.15]);
}
function door(g,m,x,z,h=1){
 box(g,m.stone,[x,h*.5,z],[.66,h+.12,.13]);box(g,m.wood,[x,h*.5-.015,z+.08],[.5,h,.045]);
 for(let i=0;i<5;i++)box(g,m.gold,[x-.2+i*.1,h*.5,z+.108],[.009,h*.92,.007]);
 for(const y of [.2,h-.2])box(g,m.iron,[x,y,z+.12],[.47,.04,.014]);ring(g,m.gold,[x+.14,h*.46,z+.14],.035,.008);
 for(let i=0;i<3;i++)box(g,m.stone,[x,.04+i*.05,z+.35-i*.06],[.82,.08,.42-i*.08]);
}
function roof(g,m,{w=2.2,d=1.65,y=1.5,rise=.8}){
 const a=Math.atan2(rise,w/2),slope=Math.hypot(w/2,rise);
 for(const side of [-1,1]){
  const slab=box(g,m.roof,[side*w/4,y+rise/2,0],[slope+.14,.08,d+.25]);slab.rotation.z=-side*a;
  for(let row=0;row<8;row++)for(let col=0;col<11;col++){
   const u=(row+.5)/8,x=side*(w/2*u),yy=y+rise*(1-u)+.055,z=-d/2+col*d/10+(row%2)*.024;
   const tile=box(g,m.roof,[x,yy,z],[slope/8+.018,.027,d/10-.01],.015);tile.rotation.z=-side*a;
  }
  rod(g,m.wood,[side*w/2,y,-d/2-.15],[side*w/2,y,d/2+.15],.045);
 }
 rod(g,m.gold,[0,y+rise+.04,-d/2-.16],[0,y+rise+.04,d/2+.16],.04);
 // Close the gables under the roof instead of leaving an unbacked floating roof.
 for(const z of [-d/2,d/2]){const shape=new THREE.Shape();shape.moveTo(-w/2,0);shape.lineTo(w/2,0);shape.lineTo(0,rise);shape.closePath();add(g,new THREE.ExtrudeGeometry(shape,{depth:.04,bevelEnabled:false}),m.cream,[0,y,z-.02]);
  rod(g,m.wood,[-w/2,y,z+.05],[0,y+rise,z+.05],.035);rod(g,m.wood,[w/2,y,z+.05],[0,y+rise,z+.05],.035);}
}
function flowers(g,m,x,y,z){
 box(g,m.wood,[x,y,z],[.48,.12,.19]);for(let i=0;i<8;i++){const xx=x-.2+i*.055;rod(g,m.leaf,[xx,y+.05,z],[xx,y+.18+Math.sin(i)*.03,z],.008);ell(g,i%2?m.gold:m.cream,[xx,y+.19+Math.sin(i)*.03,z],[.033,.025,.027]);}
}
export function house(kind='cottage'){
 const g=new THREE.Group(),m=palette(),hall=kind==='hall',guild=kind==='guildhall',w=hall?1.85:guild?2.35:1.8,d=hall?3.4:guild?1.8:1.5,h=guild?2:1.45;
 box(g,m.stone,[0,.08,0],[w+.25,.16,d+.28]);
 box(g,guild?m.stone:m.cream,[0,h/2+.12,0],[w,h,d]);
 for(const side of [-1,1]){
  const face=side*d/2;
  for(let i=0;i<6;i++){const x=-w/2+i*w/5;box(g,guild?m.cream:m.wood,[x,h/2+.1,face],[guild?.12:.085,h+.1,.1]);
   if(!guild&&i<5)rod(g,m.wood,[x,.2,face+.04],[x+w/5,h*.55,face+.04],.025);}
  for(const y of [.2,h*.57,h+.06])box(g,m.wood,[0,y,face],[w+.09,.075,.11]);
 }
 roof(g,m,{w:w+.22,d:d+.12,y:h+.12,rise:guild?1.05:.8});
 for(const side of [-1,1]){
  const wall=new THREE.Group();wall.rotation.y=side*Math.PI/2;wall.position.x=side*(w/2+.055);g.add(wall);
  for(const x of (hall?[-d*.36,-d*.12,d*.12,d*.36]:[-d*.28,d*.28])){pane(wall,m,x,h*.61,0,.29,.44);flowers(wall,m,x,h*.61-.34,.1);}
  for(const x of [-d/2,0,d/2])box(wall,m.wood,[x,h*.5,0],[.07,h,.075]);
  for(const y of [.22,h*.36,h-.07])box(wall,m.wood,[0,y,0],[d+.08,.055,.075]);
 }
 const front=d/2+.09;door(g,m,0,front,guild?1.3:1.05);
 for(const x of [-w*.32,w*.32]){pane(g,m,x,h*.62,front,.37,.5);flowers(g,m,x,h*.62-.4,front+.12);}
 pane(g,m,0,h+.43,d/2+.08,.26,.28);
 if(guild){for(const x of [-w/2,w/2])for(let i=0;i<9;i++)box(g,m.cream,[x,.2+i*.2,front-.02],[.22,.17,.15]);}
 const cx=-w*.31,cy=h+.78;box(g,m.stone,[cx,cy,-d*.22],[.31,.95,.32]);box(g,m.cream,[cx,cy+.5,-d*.22],[.4,.11,.4]);
 for(let i=0;i<5;i++)box(g,m.wood,[cx,cy-.35+i*.15,-d*.22+.165],[.31,.013,.007]);
 // A separately supported entrance canopy gives the facade depth.
 for(const x of [-.51,.51])rod(g,m.wood,[x,.12,front+.47],[x,1.19,front+.47],.035);
 box(g,m.roof,[0,1.23,front+.27],[1.22,.075,.69]);
 for(const x of [-.48,.48])curve(g,m.wood,[[x,.75,front+.47],[x,1.12,front+.32],[x,1.17,front+.02]],.024);
 if(hall){
  box(g,m.stone,[w*.3,h+.65,d*.28],[.29,.9,.32]);box(g,m.cream,[w*.3,h+1.13,d*.28],[.37,.1,.39]);
  for(const s of [-1,1])for(let i=0;i<5;i++){const z=-d*.4+i*d*.2;rod(g,m.wood,[s*w/2,.35,z],[s*w/2,h-.15,z+.32],.024);}
 }
 if(guild){
  // A civic clock lantern and carved corner pinnacles distinguish the guild from a dwelling.
  const belfry=new THREE.Group();belfry.position.set(0,h+1.02,0);g.add(belfry);
  box(belfry,m.stone,[0,.29,0],[.62,.6,.62]);
  for(const side of [-1,1])for(const x of [-.23,.23])rod(belfry,m.cream,[x,.08,side*.33],[x,.58,side*.33],.028);
  const face=add(belfry,new THREE.CircleGeometry(.19,48),m.cream,[0,.33,.318]);
  ring(belfry,m.gold,[0,.33,.322],.2,.018);rod(belfry,m.iron,[0,.33,.33],[.1,.4,.33],.009);rod(belfry,m.iron,[0,.33,.33],[-.07,.45,.33],.009);
  add(belfry,new THREE.ConeGeometry(.48,.5,4),m.roof,[0,.83,0]).rotation.y=Math.PI/4;
  ell(belfry,m.gold,[0,1.11,0],[.04,.065,.04]);
  for(const x of [-w/2,w/2]){add(g,new THREE.ConeGeometry(.17,.46,8),m.roof,[x,h+.32,d/2]);rod(g,m.gold,[x,h+.54,d/2],[x,h+.72,d/2],.015);}
 }
 const names={cottage:'The Copperleaf Cottage',hall:'The Carpenters’ Long Hall',guildhall:'The Stonewright Guild'};
 return finish(g,{title:names[kind],description:'An authored architectural miniature: layered roof courses, closed gables, structural timber, framed glazing, brass hardware, a supported porch and window gardens. The joinery and materials remain readable close up.'});
}
export function tower(){
 const g=new THREE.Group(),m=palette();add(g,new THREE.CylinderGeometry(.7,.8,.13,64),m.stone,[0,.065,0]);
 add(g,new THREE.CylinderGeometry(.55,.62,1.9,64),m.stone,[0,1.03,0]);
 for(let row=0;row<13;row++)for(let j=0;j<18;j++){const a=(j+(row%2)*.5)/18*TAU,r=.616-row*.0045;const q=box(g,row%3?m.stone:m.cream,[r*Math.sin(a),.17+row*.14,r*Math.cos(a)],[.2,.125,.06],.012);q.rotation.y=a;}
 for(const y of [.16,1.08,1.97]){const r=ring(g,m.cream,[0,y,0],y>1.9?.59:.635,.035);r.rotation.x=Math.PI/2;}
 door(g,m,0,.65,1.05);
 for(const a of [-1.05,0,1.05]){const f=new THREE.Group();f.rotation.y=a;g.add(f);pane(f,m,0,1.48,.59,.2,.42);}
 add(g,new THREE.CylinderGeometry(.74,.62,.1,64),m.wood,[0,2.04,0]);
 for(let i=0;i<24;i++){const a=i/24*TAU;rod(g,m.gold,[.73*Math.sin(a),2.04,.73*Math.cos(a)],[.73*Math.sin(a),2.3,.73*Math.cos(a)],.011);}
 const bal=ring(g,m.gold,[0,2.3,0],.73,.014);bal.rotation.x=Math.PI/2;
 for(let row=0;row<9;row++){const y=2.2+row*.082,r=.72*(1-row/10);add(g,new THREE.CylinderGeometry(r*.91,r,.1,48),m.roof,[0,y,0]);}
 ell(g,m.gold,[0,2.99,0],[.055,.08,.055]);rod(g,m.gold,[0,3.02,0],[0,3.25,0],.012);
 return finish(g,{title:'The Moonwatch Tower',description:'A tapered masonry watchtower with staggered stone courses, a copper roof, a brass gallery rail and framed windows. Material changes follow construction rather than arbitrary color bands.'});
}
export function market(){
 const g=new THREE.Group(),m=palette(),fruit=[material('#a95338',.5),material('#c8a449',.55),material('#668450',.58)];box(g,m.wood,[0,.45,0],[1.7,.7,.8]);for(let i=0;i<14;i++)box(g,m.cream,[-.8+i*.12,.45,.408],[.008,.63,.008]);
 box(g,m.wood,[0,.84,.05],[1.9,.09,1]);for(const x of [-.85,.85])for(const z of [-.43,.43])rod(g,m.wood,[x,.03,z],[x,1.75,z],.035);
 for(let i=0;i<12;i++){const strip=new THREE.Shape();strip.moveTo(-.083,0);strip.lineTo(.083,0);strip.lineTo(.083,-1.12);strip.quadraticCurveTo(0,-1.22,-.083,-1.12);strip.closePath();
  const geo=new THREE.ExtrudeGeometry(strip,{depth:.018,bevelEnabled:false});geo.rotateX(-Math.PI/2);add(g,geo,i%2?m.cream:m.roof,[-.91+i*.166,1.8,-.6]).rotation.x=.07;}
 for(let crate=0;crate<3;crate++){const x=-.59+crate*.58;box(g,m.wood,[x,.93,.03],[.52,.035,.59]);for(const z of [-.25,.31])box(g,m.wood,[x,.985,z],[.53,.105,.025]);
 for(let i=0;i<9;i++){const p=[x-.16+(i%3)*.16,1.035,-.15+Math.floor(i/3)*.18];ell(g,fruit[crate],p,[.071,.073,.068]);rod(g,m.wood,[p[0],p[1]+.062,p[2]],[p[0]+.007,p[1]+.09,p[2]],.005);}}
 for(let i=0;i<12;i++){const shape=new THREE.Shape();shape.moveTo(-.083,0);shape.lineTo(.083,0);shape.lineTo(.083,-.13);shape.quadraticCurveTo(0,-.21,-.083,-.13);shape.closePath();add(g,new THREE.ExtrudeGeometry(shape,{depth:.016,bevelEnabled:false}),i%2?m.cream:m.roof,[-.91+i*.166,1.721,.516]);}
 rod(g,m.gold,[-.85,1.79,.49],[.85,1.79,.49],.02);
 return finish(g,{title:'The Harvest Counter',description:'A striped cloth awning with real thickness and scalloped ends, supported timber posts, recessed produce trays and hand-sized fruit. A small market object with its own material hierarchy.'});
}
