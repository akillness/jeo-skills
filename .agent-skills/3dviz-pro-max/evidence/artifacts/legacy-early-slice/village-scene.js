import {THREE} from './scene-kit.js';
import {makeLandscape} from './village-landscape.js';
import {makeBuildings} from './village-buildings.js';
import {makeCreatures} from './village-creatures.js';
import {makeWorkshop} from './village-workshop.js';
import {createPicker} from './village-picking.js';
import {forceLevel, scaleLevels} from './village-tiers.js';
import {flush as flushAoCache} from './village-ao-cache.js';

export function villageScene() {
  const group = new THREE.Group();
  const landscape = makeLandscape(group), buildings = makeBuildings(group), workshop = makeWorkshop(group);
  const colliders = [...landscape.colliders, ...buildings.colliders, workshop.obstacle];
  const creatures = makeCreatures(group, {boxes: colliders, groundHeight: landscape.groundHeight, supportAt: landscape.supportAt});
  landscape.setFlow(buildings.state.flow);
  const names = ['Three-tail fox', 'Moon deer', 'Jade dragon', 'Lavender owl'];
  let selected = null, clock = 0, lastRefresh = -1, focusView, picker = null, invalidateView;
  const controls = `
    <div class="village-intro"><span class="eyebrow">A HANDCRAFTED, LIVING WORLD</span><p>Slow down. Follow a creature, inspect the inn doorway, or set the mill in motion.</p></div>
    <div class="village-panel"><div class="control-label">01 / Willow Watermill</div>
      <label class="slider-label" for="village-flow">Current strength <output id="village-flow-value">60%</output></label>
      <p class="fine" id="village-flow-help">Changes the current and wheel speed, not the water level. Adjusting resumes motion.</p>
      <input aria-describedby="village-flow-help" id="village-flow" type="range" min="0" max="1" step="0.05" value="0.6">
      <div class="actions"><button id="village-mill">Inspect the mill</button><button id="village-pond">Inspect the pond</button><button id="village-door" data-resume-motion="true" aria-pressed="false">Open inn door</button></div>
      <p id="village-wheel-state" class="fine"></p>
    </div>
    <div class="village-panel"><div class="control-label">02 / The delivery yard</div>
      <p class="fine">Release the timber cargo, then give it a nudge once it settles. Watch its weight meet the floor.</p>
      <div class="actions"><button id="village-drop" class="primary" data-resume-motion="true">Drop cargo</button><button id="village-push" data-resume-motion="true">Nudge crate</button></div>
      <label class="slider-label" for="village-height">Release height <output id="village-height-value">1.0 m</output></label>
      <input id="village-height" type="range" min="0.3" max="1.5" step="0.1" value="1">
      <div id="village-cargo-state" class="village-readout" role="status" aria-live="off">Preparing cargo…</div>
      <button id="village-collider" class="quiet-action" aria-pressed="false">Show cargo collider</button>
    </div>
    <details class="village-panel" open><summary>Meet the spirit creatures</summary>
      <div class="preset-buttons">${names.map((name, i) => `<button type="button" data-creature="${i}" aria-pressed="false">${name}</button>`).join('')}</div>
      <p id="village-creature-state" class="fine">Select a resident to inspect its movement.</p>
    </details>
    <details class="village-panel"><summary>Explore the architecture</summary>
      <div class="preset-buttons">${buildings.landmarks.map((l, i) => `<button type="button" data-landmark="${i}" aria-pressed="false">${l.name}</button>`).join('')}</div>
      <p class="hint" id="landmark-description">Thick roofs, connected frames, planted glasshouse shelves and a working wheel.</p>
    </details>
    <div class="actions"><button id="village-reset">Reset village</button></div>
    <details><summary>About this little world</summary><p>Creature motion and waterwheel response are authored controllers. The cargo uses rigid-body gravity and contact with illustrative metre/kilogram values. Its slats share one box collider. The delivery yard is reserved from creature routes. Reset village restores motion and objects; Reset view only moves the camera.</p></details>`;
  // One selection path for the sidebar button and for a click on the model itself.
  function selectLandmark(index) {
    const landmark = buildings.landmarks[index];
    focusView?.(landmark.position, 7);
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-landmark]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.landmark) === index)));
    document.querySelector('#landmark-description').textContent = landmark.description;
  }
  function selectCreature(index) {
    selected = index;
    const actor = creatures.actors[index];
    const target = () => [actor.body.position[0], actor.body.position[1] + .22, actor.body.position[2]];
    focusView?.(target(), 4.5, [.6, .45, 1], target);
    if (typeof document === 'undefined') return;
    document.querySelectorAll('[data-creature]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.creature) === index)));
    refresh();
  }
  // Named views for the viewer contract; the sidebar buttons drive the same functions.
  const views = {
    // Re-aimed for the kit-built mill: the wheel hangs off the blueprint's -X gable at x 2.59,
    // and this is the one view that has to read the hero's fine band, not the whole island.
    mill: () => focusView?.([3.5, 1.25, -1.85], 6.4, [-1, .5, .55]),
    pond: () => focusView?.([.9, .2, 4.65], 5.2, [-.2, 1, .45]),
    door: () => focusView?.([-3.3, 1, 1.25], 4.5, [.3, .18, 1]),
    cargo: () => focusView?.(workshop.target, 4.2, [-.35, 1, .15]),
    fox: () => selectCreature(0)
  };
  function refresh() {
    const output = document.querySelector('#village-cargo-state');
    if (!output) return;
    const state = workshop.state;
    if (state) {
      output.textContent = `${state.settled ? 'At rest' : 'Moving'} · ${state.speed.toFixed(2)} m/s · ${Math.max(0, state.height).toFixed(2)} m above deck`;
      document.querySelector('#village-push').disabled = !state.settled;
    }
    const b = buildings.state;
    document.querySelector('#village-wheel-state').textContent = `Wheel ${Math.abs(b.wheelSpeed).toFixed(2)} rad/s · ${b.flow === 0 ? 'current stopped · wheel slowing / stopped' : `current ${Math.round(b.flow*100)}% · sluice open`}`;
    const door = document.querySelector('#village-door');
    door.textContent = b.doorOpen ? 'Close inn door' : 'Open inn door';
    door.setAttribute('aria-pressed', String(b.doorOpen));
    if (selected !== null) {
      const a = creatures.actors[selected];
      document.querySelector('#village-creature-state').textContent = `${names[selected]} · ${a.status} · ${Math.hypot(...a.body.velocity).toFixed(2)} m/s`;
    }
  }
  function reset() {
    creatures.reset(); buildings.reset(); landscape.reset(); landscape.setFlow(buildings.state.flow); workshop.reset();
    clock = 0; lastRefresh = -1;
    if (typeof document === 'undefined') return;
    const flow = document.querySelector('#village-flow');
    if (flow) {
      flow.value = buildings.state.flow; document.querySelector('#village-flow-value').value = `${Math.round(buildings.state.flow * 100)}%`;
      document.querySelector('#village-height').value = 1; document.querySelector('#village-height-value').value = '1.0 m';
      const button = document.querySelector('#village-collider'); button.textContent = 'Show cargo collider'; button.setAttribute('aria-pressed', 'false');
      refresh();
    }
  }
  return {
    group, creatures, buildings, landscape, workshop, colliders, views,
    target: [0, 1, 0], camera: [15, 12, 17], landmarks: buildings.landmarks, controls,
    // Where the lantern heads hang, for a look that lights them (village-looks.js).
    lanterns: landscape.lanterns,
    // The physics world and the mill's baked hero both arrive from files; main.js awaits this
    // before the scene is shown, so nothing pops in after the ready flag.
    // Everything T2 has been built by the time this resolves, so the occlusion cache is written
    // out once here rather than once per object.
    init: async () => {await workshop.init(); await buildings.init(); flushAoCache();},
    lods: buildings.lods, tiers: buildings.tiers,
    // A demand-driven loop has to advance its own LOD levels: three only does it inside
    // WebGLRenderer.render, and this scene skips whole frames. Called from main.js before render.
    updateLevels(camera) {for (const lod of buildings.lods) if (lod.autoUpdate) lod.update(camera);},
    // Debug only, behind ?level=N in main.js: pin every landmark to one LOD level so the tier
    // ladder - including the T0 blockouts - can be inspected. null hands them back to the camera.
    pinLevel(index) {forceLevel(buildings.lods, index);},
    // A look with a different lens moves every LOD switch with it - see village-tiers.js.
    scaleLevels(factor) {scaleLevels(buildings.lods, factor);},
    reset,
    bind({focus, resumeMotion, canvas, camera, invalidate} = {}) {
      focusView = focus; invalidateView = invalidate;
      document.querySelectorAll('[data-creature]').forEach(button => button.onclick = () => selectCreature(Number(button.dataset.creature)));
      document.querySelectorAll('[data-landmark]').forEach(button => button.onclick = () => selectLandmark(Number(button.dataset.landmark)));
      // Clicking the model itself runs the same handlers as the sidebar; the picker decides on
      // pointerup, after OrbitControls has already claimed (and released) the pointerdown.
      if (canvas && camera) {
        picker?.dispose();
        picker = createPicker({canvas, camera, scene: group, onHover: () => invalidateView?.(), targets: [
          ...buildings.landmarks.map((landmark, i) => ({object: landmark.object, position: landmark.position, onSelect: () => selectLandmark(i)})),
          ...creatures.actors.map((actor, i) => ({object: actor.object, position: () => [actor.body.position[0], 0, actor.body.position[2]], onSelect: () => selectCreature(i)}))
        ]});
      }
      document.querySelector('#village-pond').onclick = views.pond;
      document.querySelector('#village-mill').onclick = views.mill;
      document.querySelector('#village-door').onclick = () => {buildings.toggleDoor(); views.door(); refresh();};
      document.querySelector('#village-flow').oninput = event => {
        const value = Number(event.target.value); buildings.setFlow(value); landscape.setFlow(value); resumeMotion?.();
        document.querySelector('#village-flow-value').value = `${Math.round(value * 100)}%`; refresh();
      };
      document.querySelector('#village-height').oninput = event => {
        workshop.setHeight(Number(event.target.value)); document.querySelector('#village-height-value').value = `${Number(event.target.value).toFixed(1)} m`;
      };
      document.querySelector('#village-drop').onclick = () => {workshop.drop(); views.cargo(); refresh();};
      document.querySelector('#village-push').onclick = () => {workshop.push(); views.cargo(); refresh();};
      document.querySelector('#village-collider').onclick = event => {
        const visible = workshop.toggleCollider(); event.currentTarget.setAttribute('aria-pressed', String(visible));
        event.currentTarget.textContent = visible ? 'Hide cargo collider' : 'Show cargo collider'; views.cargo();
      };
      document.querySelector('#village-reset').onclick = reset;
      refresh();
    },
    update(_time, dt = 0) {
      buildings.update(dt); landscape.update(clock, dt); creatures.update(clock, dt); workshop.update(dt);
      if (dt > 0) {
        clock += dt;
        if (clock - lastRefresh > .15 && typeof document !== 'undefined') {refresh(); lastRefresh = clock;}
      }
    },
    cleanup() {workshop.cleanup(); picker?.dispose(); picker = null;}
  };
}
