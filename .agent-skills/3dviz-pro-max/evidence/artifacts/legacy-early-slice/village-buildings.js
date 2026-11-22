// village-buildings.js - the five landmarks, assembled from ./kits blueprints.
// Copper Kettle Inn: kit primitives (pierced walls, timber frame, tiled slopes, chimney, sign)
// around the one driven door in the village. Moonwatch Observatory: kits/buildings/round-tower.
// Willow Watermill: kits/buildings/watermill, its wheel driven by this scene's flow control and
// never by the kit's own animate(). Morel Cottage and Sunleaf Glasshouse: authored shells that no
// blueprint covers, dressed with kit primitives and a kits/buildings/market-stall counter.
// Quality tiers (phase 9D): every landmark is assembled exactly as before, then handed to
// village-tiers.js, which builds its surface at T2, measures its proof distances and hangs it in
// a THREE.LOD beside a T0 blockout proxy. The Willow Watermill also loads the Blender-baked T3
// hero, which draws past the distance where its wheel is legible. Nothing below knows a tier
// number: the policy is all in village-tiers.js.
import {THREE,mesh,sphere,part,bevelledBox,materialFor,wallWithOpenings} from './scene-kit.js';
import {colliderFor} from './village-colliders.js';
import {createBuildingMotion} from './village-building-motion.js';
import {attachHero,heroTier,lodReport,tierLandmark} from './village-tiers.js';
import {GLASSHOUSE,INN,MARKET_STALL,MUSHROOM,ROUND_TOWER,WATERMILL}
 from './village-tier-families.js';
import {create as roundTower} from './kits/buildings/round-tower.js';
import {create as watermill} from './kits/buildings/watermill.js';
import {create as marketStall} from './kits/buildings/market-stall.js';
import {create as timberFrame} from './kits/primitives/timber-frame.js';
import {create as roofSlope} from './kits/primitives/roof-tile-strip.js';
import {create as chimney} from './kits/primitives/chimney.js';
import {create as signBoard} from './kits/primitives/sign.js';
import {PALETTE,box,windowUnit,hingedDoor,mushroomShell,telescope,glassShell,herbBeds}
 from './village-building-parts.js';

const {timber,cream,stone}=PALETTE;
const plasterOf=color=>materialFor(color,{roughness:.9});

/** One pierced wall plus the kit window units that dress its holes. */
function wall(group,{width,height,depth=.14,openings,windows=[],color=cream,position,rotationY=0,seed=1}){
 const built=wallWithOpenings({width,height,depth,openings,material:plasterOf(color)});
 built.position.set(...position);built.rotation.y=rotationY;group.add(built);
 windows.forEach((hole,i)=>{
  const local=new THREE.Vector3(hole.x,hole.y,depth/2+.01).applyAxisAngle(new THREE.Vector3(0,1,0),rotationY);
  windowUnit(group,hole,[position[0]+local.x,position[1]+local.y,position[2]+local.z],rotationY,seed+i);
 });
 return built;
}

/** Two tiled slopes and their ridge, laid over a ridge line running along local Z. */
function gableRoof(group,{halfSpan,halfLength,eaveY,pitchRad,color,seed=1}){
 const roof=new THREE.Group();roof.rotation.y=Math.PI/2;
 roof.position.y=eaveY+halfSpan*Math.tan(pitchRad);group.add(roof);
 for(const side of [1,-1]){
  const slope=roofSlope({width:halfLength*2,run:halfSpan,pitchRad,side,color,verge:.14,seed:seed+side});
  roof.add(slope.group);
 }
 roof.add(part(bevelledBox({width:halfLength*2+.3,height:.12,depth:.26,bevel:.03}),
  materialFor(0x4a5f62,{roughness:.84}),[0,.05,0]));
 return roof.position.y;
}

/** A plastered gable end that meets the roof plane exactly, so no daylight shows at the verge. */
function gableEnd(group,{halfSpan,rise,y,z,thickness=.14,color=cream}){
 const shape=new THREE.Shape();shape.moveTo(-halfSpan,0);shape.lineTo(halfSpan,0);shape.lineTo(0,rise);shape.closePath();
 return mesh(group,new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false}),color,
  [0,y,z-thickness/2],{roughness:.9});
}

/** A landmark's solid, taken from the blueprint's own collider descriptors rather than from its
 *  render bounds: a launder over a wheel or a canopy over a counter is not something to walk into.
 *  Extra world-space groups (the authored parts of a landmark) are unioned in. */
function kitCollider(kitGroup,list,extras,name){
 kitGroup.updateWorldMatrix(true,true);
 const bounds=new THREE.Box3(),v=new THREE.Vector3();
 for(const {centre_m,size_m} of list)for(const sx of [-.5,.5])for(const sy of [-.5,.5])for(const sz of [-.5,.5])
  bounds.expandByPoint(v.set(centre_m[0]+sx*size_m[0],centre_m[1]+sy*size_m[1],centre_m[2]+sz*size_m[2]).applyMatrix4(kitGroup.matrixWorld));
 for(const extra of extras){extra.updateWorldMatrix(true,true);bounds.union(new THREE.Box3().setFromObject(extra));}
 return {min:bounds.min.toArray(),max:bounds.max.toArray(),name};
}

function buildBase(parent,x,z,name){const g=new THREE.Group();g.position.set(x,0,z);parent.add(g);g.userData.landmark=name;return g;}

/** Copper Kettle Inn - pierced walls with a real doorway, so the driven leaf has somewhere to go. */
function buildInn(parent){
 const inn=buildBase(parent,-3.4,.1,'The Copper Kettle');inn.rotation.y=.2;
 const wallH=2.05,base=.32,top=base+wallH;
 inn.add(part(bevelledBox({width:2.75,height:base,depth:2.02,bevel:.04}),
  materialFor(stone,{roughness:.88}),[0,base/2,0]));
 wall(inn,{width:2.4,height:wallH,position:[0,base,.78],seed:1,
  openings:[{x:-.72,y:1.62,width:.5,height:.5},{x:0,y:.575,width:.66,height:1.15},{x:.72,y:1.62,width:.5,height:.5}],
  windows:[{x:-.72,y:1.62,width:.5,height:.5},{x:.72,y:1.62,width:.5,height:.5}]});
 wall(inn,{width:2.4,height:wallH,position:[0,base,-.78],rotationY:Math.PI,seed:11,
  openings:[{x:-.6,y:1.5,width:.5,height:.55},{x:.6,y:1.5,width:.5,height:.55}],
  windows:[{x:-.6,y:1.5,width:.5,height:.55},{x:.6,y:1.5,width:.5,height:.55}]});
 for(const side of [1,-1])wall(inn,{width:1.7,height:wallH,position:[side*1.13,base,0],rotationY:side*Math.PI/2,
  seed:21+side,openings:[{x:0,y:1.5,width:.42,height:.5}],windows:[{x:0,y:1.5,width:.42,height:.5}]});
 box(inn,0x55483f,[0,.35,-.1],[2.12,.06,1.38]);
 const frame=timberFrame({width:2.4,height:wallH,posts:4,braceRun:.62,color:'#674838',seed:5});
 frame.group.position.set(0,base,.85);inn.add(frame.group);
 const ridgeY=gableRoof(inn,{halfSpan:1.45,halfLength:.85,eaveY:top,pitchRad:.876,color:'#577f7b',seed:9});
 for(const side of [1,-1])gableEnd(inn,{halfSpan:1.45,rise:ridgeY-top,y:top,z:side*.85,thickness:side>0?.14:-.14});
 const stack=chimney({width:.36,depth:.42,height:2.2,brickColor:'#785d56',stoneColor:'#a8a7ad',seed:13});
 stack.group.position.set(-.8,1.9,-.35);inn.add(stack.group);
 const board=signBoard({boardWidth:.62,boardHeight:.42,arm:.5,drop:.2,boardColor:'#5b4632',
  fieldColor:'#c8a45c',seed:31});
 board.group.position.set(1.12,2.15,.85);inn.add(board.group);
 // Porch: two posts under a tiled lean-to, the sheltered edge the landmark description promises.
 const post=bevelledBox({width:.12,height:1.28,depth:.12,bevel:.02});
 for(const x of [-1,1])inn.add(part(post,materialFor(timber,{roughness:.78}),[x,.84,1.35]));
 const porch=roofSlope({width:2.3,run:.72,pitchRad:.42,side:1,color:'#c87d59',verge:.1,seed:17});
 porch.group.position.set(0,1.78,.82);inn.add(porch.group);
 // Copper lantern beside the door: the inn's warm point light source in the frame.
 box(inn,0x423d47,[1.42,1.55,.9],[.24,.26,.2],{roughness:.5,metalness:.35});
 sphere(inn,0xe1b862,[1.42,1.55,.98],.09);
 mesh(inn,new THREE.SphereGeometry(1,16,10),0xffd798,[1.42,1.55,.9],{emissive:0xffbe6a,emissiveIntensity:1.5}).scale.setScalar(.07);
 const pivot=hingedDoor(inn);
 return {inn,pivot};
}

/** Moonwatch Observatory - kits/buildings/round-tower with the village's own instrument on top. */
function buildTower(parent){
 const tower=buildBase(parent,.1,-4.35,'Moonwatch Observatory');tower.position.y=.35;
 const kit=roundTower({height:3.3,baseRadius:.95,topRadius:.78,merlons:12,slits:4,doorHeight:.55,seed:3});
 tower.add(kit.group);
 const walkway=kit.sockets.find(s=>s.name==='walkway').position_m;
 telescope(tower,walkway[1]);
 sphere(tower,0xf5d87d,[0,walkway[1]+1.5,0],.12);
 return {tower,solid:kitCollider(kit.group,kit.colliders,[],'Moonwatch Observatory')};
}

/** Willow Watermill - kits/buildings/watermill, turned so its wheel faces the stream and the
 *  mill view. The kit's animate() is never called: this scene's flow control is the one driver,
 *  so the hub found at the kit's `wheel` socket is re-hung under a pivot this module turns. */
function buildMill(parent){
 const mill=buildBase(parent,4.25,-1.9,'Willow Watermill');
 const kit=watermill({seed:5});
 kit.group.scale.setScalar(.42);kit.group.rotation.y=Math.PI;mill.add(kit.group);
 const at=kit.sockets.find(s=>s.name==='wheel').position_m;
 const hub=kit.group.children.find(o=>o.isGroup&&o.position.distanceTo(new THREE.Vector3(...at))<1e-6);
 if(!hub)throw new Error('watermill kit no longer exposes a hub at its wheel socket');
 const wheel=new THREE.Group();wheel.name='mill-wheel';wheel.position.copy(hub.position);
 wheel.rotation.y=Math.PI/2;kit.group.add(wheel);
 const mount=new THREE.Group();mount.rotation.y=-Math.PI/2;wheel.add(mount);
 hub.position.set(0,0,0);mount.add(hub);
 // Drive key on the axle end: the small part that makes the shaft's rotation readable close up.
 const axle=new THREE.Group();axle.name='mill-axle';axle.position.set(-at[0]*.42,at[1]*.42,0);mill.add(axle);
 axle.add(part(bevelledBox({width:.14,height:.05,depth:.05,bevel:.012}),
  materialFor(0xc5a267,{metalness:.5,roughness:.35}),[0,.19,.28]));
 axle.add(part(new THREE.CylinderGeometry(.055,.055,.16,10),materialFor(0x8b938b,{metalness:.6,roughness:.35}),
  [0,0,.28],[0,0,Math.PI/2]));
 // Sluice gate: the authored control surface. Its travel visualises the normalised flow value;
 // it does not solve a fluid flow, and no kit blueprint carries a driven gate.
 const gateX=-at[0]*.42-.5;
 const sluice=new THREE.Group();mill.add(sluice);
 for(const x of [gateX-.2,gateX+.2]){box(sluice,timber,[x,.68,-.77],[.09,.94,.12]);box(sluice,stone,[x,.19,-.77],[.18,.15,.23]);}
 box(sluice,timber,[gateX,1.17,-.77],[.58,.11,.16]);
 const gate=new THREE.Group();gate.name='mill-sluice-gate';gate.position.set(gateX,.23,-.77);sluice.add(gate);
 for(let i=0;i<4;i++)box(gate,0xa27d52,[0,i*.12,0],[.34,.105,.085]);
 box(gate,0x565c56,[0,.2,.052],[.07,.49,.025]);
 mesh(sluice,new THREE.CylinderGeometry(.022,.022,.55,8),0x8b938b,[gateX,1.1,-.77],{metalness:.65,roughness:.35});
 const crank=mesh(sluice,new THREE.TorusGeometry(.12,.027,6,16),0xc5ab6a,[gateX,1.4,-.77]);crank.rotation.x=Math.PI/2;
 return {mill,body:kit.group,wheel,axle,gate,
         solid:kitCollider(kit.group,kit.colliders,[sluice],'Willow Watermill')};
}

/** Morel Cottage - a fruiting body: authored, with kit door and window primitives. */
function buildMushroom(parent){
 const mushroom=buildBase(parent,-3.75,-3.75,'Morel Cottage');mushroom.position.y=.2;
 mushroomShell(mushroom);
 return mushroom;
}

/** Sunleaf Glasshouse - authored panes over kit herb beds, with a market-stall counter in front. */
function buildMarket(parent){
 const market=buildBase(parent,3.45,3.55,'Sunleaf Glasshouse');market.rotation.y=-.35;
 const plinth=part(bevelledBox({width:2.5,height:.34,depth:1.7,bevel:.04}),
  materialFor(stone,{roughness:.88}),[0,.17,-.15]);market.add(plinth);
 const shell=new THREE.Group(),beds=new THREE.Group();market.add(shell,beds);
 glassShell(shell);herbBeds(beds);
 const stall=marketStall({width:2.3,depth:.86,height:1.42,stripes:8,seed:11});
 stall.group.position.set(0,0,1.12);market.add(stall.group);
 return {market,solid:kitCollider(stall.group,stall.colliders,[shell,beds,plinth],'Sunleaf Glasshouse')};
}

export function makeBuildings(parent){
 const motion=createBuildingMotion();
 // `object` is the building group: the picker resolves a canvas hit up to this node.
 const landmarks=[];const add=(name,description,position,object)=>landmarks.push({name,description,position,object});
 const tiers=[];
 const {inn,pivot}=buildInn(parent);
 const innTier=tierLandmark(inn,{id:'inn',families:INN});
 add('Copper Kettle Inn','Timber beams, copper lanterns, and a sheltered porch for wandering creatures.',[-3.4,1.5,.1],inn);
 const {tower,solid:towerSolid}=buildTower(parent);
 const towerTier=tierLandmark(tower,{id:'round-tower',families:ROUND_TOWER});
 add('Moonwatch Observatory','A brass telescope watches the sky above the village’s highest terrace.',[.1,2.8,-4.35],tower);
 const {mill,body,wheel,axle,gate,solid:millSolid}=buildMill(parent);
 const millTier=tierLandmark(mill,{id:'watermill',families:WATERMILL,parts:[body]});
 add('Willow Watermill','Raise the sluice and watch an authored flow control turn the twelve paddles, hub and axle.',[4.25,1.3,-1.9],mill);
 const mushroom=buildMushroom(parent);
 const mushroomTier=tierLandmark(mushroom,{id:'morel-cottage',families:MUSHROOM});
 add('Morel Cottage','A spotted mushroom roof shelters a tiny round cottage in the fern garden.',[-3.75,1.4,-3.75],mushroom);
 const {market,solid:marketSolid}=buildMarket(parent);
 const marketTier=tierLandmark(market,{id:'glasshouse',families:{...MARKET_STALL,...GLASSHOUSE}});
 add('Sunleaf Glasshouse','Warm panes, herb beds, and a market counter full of golden fruit.',[3.45,1.2,3.55],market);
 for(const [name,built] of [['Copper Kettle Inn',innTier],['Moonwatch Observatory',towerTier],
                            ['Willow Watermill',millTier],['Morel Cottage',mushroomTier],
                            ['Sunleaf Glasshouse',marketTier]])
  tiers.push({name,tier:built.info.tier,lod:built.lod,info:built.info});
 // Two of the five come from the render bounds because they are authored geometry; the three
 // built on blueprints use the blueprints' own collider descriptors instead. The bounds are
 // taken from the near level, never from the base: the T0 proxy is a budgeting box, not a solid.
 const colliders=[colliderFor(innTier.near,inn.userData.landmark),towerSolid,millSolid,
                  colliderFor(mushroomTier.near,mushroom.userData.landmark),marketSolid];
 // Reserve every yaw of the door leaf around its fixed hinge, including its handle.
 // This static bound intentionally does not open an actor route when the door opens.
 const hinge=pivot.getWorldPosition(new THREE.Vector3()),doorBounds=colliders[0];
 for(const axis of [0,2]){doorBounds.min[axis]=Math.min(doorBounds.min[axis],hinge.getComponent(axis)-.7);doorBounds.max[axis]=Math.max(doorBounds.max[axis],hinge.getComponent(axis)+.7);}
 function render(){const s=motion.state;wheel.rotation.z=s.wheelAngle;axle.rotation.x=s.wheelAngle;pivot.rotation.y=-s.doorAngle;gate.position.y=.23+s.flow*.38;}
 render();
 // The baked hero is a file, so it arrives after the scene is standing. It slots into the mill's
 // LOD at the `mid` distance; a tree without kits/gltf/watermill-t3.glb resolves to null and the
 // mill keeps its procedural tier at every distance. Failure here is never fatal to the scene.
 async function init(){
  const hero=await heroTier('watermill',{scale:.42},
                            ()=>import('./kits/gltf/watermill-t3.js'));
  if(!hero)return {watermill:millTier.info.tier};
  hero.group.rotation.y=Math.PI;          // the placement buildMill gave the procedural kit
  attachHero(millTier.lod,hero.group,millTier.distances.mid);
  tiers[2].tier=`${millTier.info.tier}+T3`;
  return {watermill:tiers[2].tier};
 }
 return {landmarks,colliders,init,lods:tiers.map(entry=>entry.lod),tiers:()=>lodReport(tiers),
         update(dt){motion.update(dt);render();},setFlow(value){motion.setFlow(value);render();},
         setDoor(open){motion.setDoor(open);},toggleDoor(){motion.toggleDoor();},
         reset(){motion.reset();render();},get state(){return motion.state;}};
}
