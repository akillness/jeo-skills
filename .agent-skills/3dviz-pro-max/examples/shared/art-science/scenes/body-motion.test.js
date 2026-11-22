import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceCycle,armCycle,breathingCycle,cardiacCycle,heartPose,lungPose} from '../body-motion.js';
import {THREE} from '../scene-kit.js';
import {addMorphPoses,rigArmMuscles} from '../anatomy-motion.js';
const near=(a,b,tol=1e-9)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('body playback holds the scrubbed pose and rate changes advance without resetting phase',()=>{
 near(advanceCycle(.37,5,60,false),.37);near(advanceCycle(.37,0,60),.37);
 near(advanceCycle(.37,.1,60),.47);near(advanceCycle(.37,.1,120),.57);
 near(advanceCycle(.95,.1,60),.05);
 for(const cycle of [armCycle,breathingCycle,cardiacCycle])assert.deepEqual(cycle(0),cycle(1));
});
test('breathing expansion peaks at the authored inspiration boundary and reverses during expiration',()=>{
 near(breathingCycle(0).expansion,0);near(breathingCycle(.4).expansion,1);assert.equal(breathingCycle(.4).inhaling,false);
 assert.ok(breathingCycle(.2).inhaling);assert.ok(!breathingCycle(.7).inhaling);
 near(breathingCycle(.2).expansion,breathingCycle(.7).expansion);
 const [x,y,z]=lungPose(1,-1,1);assert.ok(x>1&&y<-1&&z>1);
});
test('cardiac regional shapes preserve common coordinates and upper roots, with ordered contractions',()=>{
 assert.ok(cardiacCycle(.08).atrial>0);near(cardiacCycle(.08).ventricular,0);
 assert.ok(cardiacCycle(.35).ventricular>0);near(cardiacCycle(.35).atrial,0);
 near(cardiacCycle(.8).ventricular,0);
 assert.deepEqual(heartPose(.4,1.2,.3,'ventricular'),[.4,1.2,.3]);
 const a=heartPose(.4,-1,.3,'ventricular');assert.ok(a[0]<.4&&a[1]>-1&&a[2]<.3);
});
test('corrective morphs preserve rest geometry and carry finite recomputed normals',()=>{
 const g=new THREE.BoxGeometry(1,2,1),o=new THREE.Mesh(g,new THREE.MeshStandardMaterial()),base=g.attributes.position.array.slice();
 addMorphPoses(o,[(x,y,z)=>[x*1.2,y*.9,z],(x,y,z)=>[x*.9,y*1.1,z]]);
 assert.deepEqual(g.attributes.position.array,base);assert.equal(o.morphTargetInfluences.length,2);
 for(const normal of g.morphAttributes.normal)assert.ok([...normal.array].every(Number.isFinite));
 g.dispose();o.material.dispose();
});
test('arm rig keeps a proximal point anchored while its distal point follows the elbow bone',()=>{
 const group=new THREE.Group(),g=new THREE.CylinderGeometry(.15,.15,3,8,4);g.translate(0,.5,0);
 const o=new THREE.Mesh(g,new THREE.MeshStandardMaterial());o.userData={name:'biceps'};group.add(o);
 const pivot=new THREE.Vector3(0,-.35,0),rig=rigArmMuscles(group,[o],pivot),skin=rig.muscles[0].o;
 rig.elbow.rotation.x=-Math.PI/3;group.updateMatrixWorld(true);rig.elbow.updateMatrixWorld(true);
 const positions=g.attributes.position;let upper=0,lower=0;
 // A mid-belly vertex must not be dragged around the elbow into the stationary humerus.
 for(let i=0;i<positions.count;i++)if(positions.getY(i)>=pivot.y+.12)
   assert.equal(g.attributes.skinWeight.getY(i),0);
 for(let i=1;i<positions.count;i++){if(positions.getY(i)>positions.getY(upper))upper=i;if(positions.getY(i)<positions.getY(lower))lower=i;}
 const top=new THREE.Vector3().fromBufferAttribute(positions,upper),bottom=new THREE.Vector3().fromBufferAttribute(positions,lower);
 assert.ok(skin.applyBoneTransform(upper,top.clone()).distanceTo(top)<1e-6);
 const expected=bottom.clone().sub(pivot).applyAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/3).add(pivot);
 assert.ok(skin.applyBoneTransform(lower,bottom.clone()).distanceTo(expected)<1e-6);
 rig.dispose();g.dispose();skin.material.dispose();
});
test('deep medial triceps retains source belly instead of applying a bone-intruding shrink target',()=>{
 const group=new THREE.Group(),g=new THREE.CylinderGeometry(.15,.15,3,8,4);g.translate(0,.5,0);
 const rest=g.attributes.position.array.slice(),o=new THREE.Mesh(g,new THREE.MeshStandardMaterial());
 o.userData={name:'medial head of right triceps brachii'};group.add(o);
 const rig=rigArmMuscles(group,[o],new THREE.Vector3(0,-.35,0)),skin=rig.muscles[0].o;
 assert.deepEqual(g.attributes.position.array,rest);assert.equal(skin.morphTargetInfluences,undefined);
 assert.ok(g.attributes.skinWeight.array.some(w=>w>0&&w<1));
 rig.dispose();g.dispose();skin.material.dispose();
});
