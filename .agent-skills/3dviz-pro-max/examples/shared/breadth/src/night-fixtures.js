import {THREE,add,box,ell,rod,material} from './craft-forms.js';
// Coordinates belong to the village's authoring space. Lights are converted only after normalization.
export function addNightFixtures(parent){
 const iron=material('#263b3c',.4,.72),brass=material('#bc9457',.32,.7),glow=material('#edc993',.4);
 glow.emissive.set('#ffb662');glow.emissiveIntensity=0;
 const sites=[[-2.55,.25,.63],[-1.73,.12,1.48],[.66,.12,2.43],[2.15,.2,.02],[.52,.1,-1.31]];
 const fixtures=new THREE.Group();fixtures.name='Night fixtures';parent.add(fixtures);
 const bulbs=[];
 for(const [x,y,z] of sites){
  const g=new THREE.Group();g.position.set(x,y,z);fixtures.add(g);
  box(g,iron,[0,.025,0],[.18,.05,.18]);rod(g,iron,[0,.04,0],[0,.78,0],.025);rod(g,brass,[0,.78,0],[.15,.78,0],.016);
  const lamp=new THREE.Group();lamp.position.set(.15,.57,0);g.add(lamp);
  add(lamp,new THREE.ConeGeometry(.13,.14,4),iron,[0,.19,0]).rotation.y=Math.PI/4;
  for(const s of [-1,1]){box(lamp,brass,[s*.082,-.08,0],[.015,.025,.18]);box(lamp,brass,[0,-.08,s*.082],[.18,.025,.015]);}
  for(const sx of [-1,1])for(const sz of [-1,1])rod(lamp,iron,[sx*.075,-.07,sz*.075],[sx*.075,.13,sz*.075],.008);
  const bulb=ell(lamp,glow,[0,.035,0],[.046,.08,.046]);bulb.castShadow=false;bulbs.push(bulb);
 }
 return {fixtures,bulbs,glow,anchors:sites.map(([x,y,z])=>new THREE.Vector3(x+.15,y+.605,z))};
}
