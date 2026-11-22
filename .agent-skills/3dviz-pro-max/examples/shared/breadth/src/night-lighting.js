import * as THREE from 'three';
const deg=Math.PI/180;
export const NIGHT_VIEWS={
 'blue-hour':{title:'The Last Light',description:'A low amber key grazes roof courses and masonry while cool sky light holds the shadows. Turn the sun around the village to compare front, side and rim lighting.',position:[.36,.26,.44],target:[0,.03,0],azimuth:-65,elevation:14,key:2.4,warm:.55,sky:.045,exposure:1.05,dusk:true,hero:0},
 'night-river':{title:'Lanterns by the River',description:'Warm pools of lantern light lead through a cool moonlit village. Compare the full rig with moonlight alone or lanterns alone; darkness between the pools gives the scene depth.',position:[.36,.26,.44],target:[0,.03,0],azimuth:-120,elevation:38,key:.8,warm:1,sky:.085,exposure:1.05,hero:2},
 'night-bridge':{title:'Across the Lantern Bridge',description:'A lantern lights the bridge and pond edge. Moonlight catches the rail, leaves and water while the selected lantern casts a local shadow. The water uses surface highlights, not a mirrored scene.',position:[.17,.115,.235],target:[.043,.032,.07],azimuth:-95,elevation:24,key:.72,warm:1.2,sky:.07,exposure:1.1,hero:2},
 'night-doorway':{title:'A Light at the Door',description:'Warm window panes and a nearby lantern pick out the door hardware, timber joints and stone steps. Move the cool key behind the roof to see the silhouette separate from the background.',position:[-.015,.135,.09],target:[-.085,.052,.002],azimuth:125,elevation:32,key:.85,warm:1.05,sky:.07,exposure:1.08,hero:0},
 'night-mill':{title:'The Mill After Dark',description:'Low warm light reveals the spokes and rim of the mill wheel against cool timber and water. Change the lantern output to inspect the difference between a glowing bulb and actual surface illumination.',position:[.018,.093,.18],target:[-.076,.043,.053],azimuth:-100,elevation:22,key:.8,warm:1.2,sky:.065,exposure:1.1,hero:1}
};
export function keyPosition(azimuth,elevation,radius=.7){const a=azimuth*deg,e=elevation*deg;return [radius*Math.cos(e)*Math.sin(a),.06+radius*Math.sin(e),radius*Math.cos(e)*Math.cos(a)];}
export function createNightLighting(scene,renderer,studio){
 const root=new THREE.Group();root.name='Authored night lighting';root.visible=false;scene.add(root);
 const key=new THREE.DirectionalLight('#abc7ee',.8);root.add(key,key.target);key.target.position.set(0,.045,0);key.castShadow=true;
 key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-.255,right:.255,top:.255,bottom:-.255,near:.01,far:1.5});
 key.shadow.camera.updateProjectionMatrix();key.shadow.bias=-.00005;key.shadow.normalBias=.00014;
 const hero=new THREE.SpotLight('#ffc27b',.008,.14,Math.PI*.43,.7,2);hero.castShadow=true;hero.shadow.mapSize.set(512,512);hero.shadow.camera.near=.001;hero.shadow.camera.far=.3;hero.shadow.bias=-.0001;hero.shadow.normalBias=.00008;root.add(hero,hero.target);
 const fill=new THREE.HemisphereLight('#6388b4','#221d26',.3);root.add(fill);
 const pools=Array.from({length:5},()=>{const p=new THREE.PointLight('#ffbe79',.002,.075,2);root.add(p);return p;});
 let current=null,state=null,model=null,windows=[],surfaces=[];
 function restoreWindows(){for(const w of windows){w.mat.emissive.copy(w.color);w.mat.emissiveIntensity=w.intensity;}windows=[];for(const s of surfaces){s.mat.roughness=s.roughness;s.mat.metalness=s.metalness;}surfaces=[];if(model?.night)model.night.glow.emissiveIntensity=0;}
 function clear(){restoreWindows();root.visible=false;current=null;model=null;}
 function apply(){
  if(!state||!model)return;
  const only=state.isolate;
  key.position.set(...keyPosition(state.azimuth,state.elevation));key.color.set(current.dusk?'#ffc588':'#a8c9ef');key.intensity=only==='lanterns'?0:state.key;
  scene.environmentIntensity=only==='all'?state.sky*.45:0;fill.intensity=only==='all'?state.sky*3.5:0;
  renderer.toneMappingExposure=state.exposure;
  const power=only==='moon'?0:state.warm;
  model.group.updateMatrixWorld(true);
  const points=model.night.anchors.map(p=>model.subject.localToWorld(p.clone()));
  pools.forEach((p,i)=>{p.position.copy(points[i]);p.intensity=(i===current.hero ? .008 : .022)*power;});
  hero.position.copy(points[current.hero]);hero.target.position.copy(hero.position).add(new THREE.Vector3(.004,-.032,.012));hero.intensity=.025*power;
  model.night.glow.emissiveIntensity=power*2.2;
  for(const w of windows){w.mat.emissive.set('#ffb55f');w.mat.emissiveIntensity=power*1.35;}
 }
 function activate(name,exhibit){
  clear();current=NIGHT_VIEWS[name];model=exhibit;state={...current,isolate:'all'};root.visible=true;
  for(const light of [studio.key,studio.fill,studio.rim,studio.contact])light.visible=false;
  scene.background=new THREE.Color(current.dusk?'#172333':'#060f1e');scene.fog=null;
  const seen=new Set();model.group.traverse(o=>{if(o.material?.name==='window-glass'&&!seen.has(o.material)){seen.add(o.material);windows.push({mat:o.material,color:o.material.emissive.clone(),intensity:o.material.emissiveIntensity});}});
  model.group.traverse(o=>{if(o.material?.name==='pond-water'&&!surfaces.some(s=>s.mat===o.material)){surfaces.push({mat:o.material,roughness:o.material.roughness,metalness:o.material.metalness});o.material.roughness=.38;o.material.metalness=.08;}});
  apply();
 }
 function bind(panel,invalidate){
  const intro=document.createElement('p');intro.className='fine';intro.textContent='Light direction changes shadows; lantern output changes both bulbs and the surfaces they illuminate.';panel.append(intro);
  const sync=[];
  function refresh(){apply();sync.forEach(f=>f());invalidate();}
  for(const [name,k,min,max,step] of [['Key azimuth (degrees)','azimuth',-180,180,1],['Key elevation (degrees)','elevation',5,80,1],['Moon / sun strength','key',0,3,.01],['Lantern output','warm',0,2,.05],['Sky fill','sky',0,.12,.005],['Exposure','exposure',.6,1.6,.01]]){
   const label=document.createElement('label'),text=document.createElement('span'),out=document.createElement('output'),input=document.createElement('input');text.textContent=name;label.append(text,out,input);input.type='range';input.min=min;input.max=max;input.step=step;input.setAttribute('aria-label',name);
   sync.push(()=>{input.value=state[k];out.textContent=' '+Number(state[k]).toFixed(k==='azimuth'||k==='elevation'?0:k==='sky'?3:2);});input.oninput=()=>{state[k]=Number(input.value);refresh();};panel.append(label);
  }
  const buttons=document.createElement('div');buttons.className='lighting-isolation';panel.append(buttons);
  for(const [id,title] of [['all','Full lighting'],['moon','Key only'],['lanterns','Lanterns only']]){const b=document.createElement('button');b.textContent=title;sync.push(()=>b.setAttribute('aria-pressed',String(state.isolate===id)));b.onclick=()=>{state.isolate=id;refresh();};buttons.append(b);}
  const reset=document.createElement('button');reset.textContent='Reset lighting';reset.onclick=()=>{state={...current,isolate:'all'};refresh();};panel.append(reset);sync.forEach(f=>f());
 }
 return {activate,clear,bind,dispose(){clear();for(const l of [key,hero,fill,...pools]){l.shadow?.map?.dispose();l.dispose?.();}root.removeFromParent();}};
}
