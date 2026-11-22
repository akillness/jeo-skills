// CLOCKWORK HEIST — four hooded thieves, one giant clock tower.
// Entry point: renderer, post-processing, game states, players, camera.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { loadAssets } from './assets.js';
import { initMaterials } from './materials.js';
import { Level } from './level.js';
import { Decor } from './decor.js';
import { Thief } from './thief.js';
import { Bot } from './bots.js';
import { Sound } from './audio.js';
import { Fx } from './fx.js';
import { Hud } from './hud.js';
import { stepBody } from './physics.js';
import { PHYS, PLAYER_COLORS, KEY_SCHEMES, CAMERA, HEIST_MINUTES } from './config.js';
import { Controller, endFrame, keyPressed, padIndices } from './input.js';
import { LEVEL } from './levelData.js';

const Q = new URLSearchParams(location.search);
const DEBUG = {
  auto: Q.has('auto'),
  bots: Q.has('bots'),
  x: Q.has('x') ? parseFloat(Q.get('x')) : null,
  speed: Q.has('speed') ? parseFloat(Q.get('speed')) : 1,
  title: Q.has('title'),
  zoom: Q.has('zoom') ? parseFloat(Q.get('zoom')) : null,
};
if (DEBUG.zoom) { CAMERA.minDist = DEBUG.zoom; CAMERA.maxDist = DEBUG.zoom; }

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uFade: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uFade; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(1.05, 0.99, 0.88), 0.55);
      col += vec3(0.022, 0.012, 0.0) * (1.0 - l);
      col = mix(vec3(l), col, 1.06);
      vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y;
      float v = smoothstep(1.05, 0.32, length(d));
      col *= mix(0.55, 1.0, v);
      float n = fract(sin(dot(vUv * uRes + fract(uTime) * 61.7, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.022;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(col, c.a);
    }`,
};

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 16 / 9, 0.3, 600);
    this.camera.position.set(-6, 3, 20);
    this.time = 0;
    this.simTime = 0;
    this.acc = 0;
    this.state = 'loading';
    this.thieves = [];
    this.joined = [null, null, null, null]; // slot -> Controller
    this.camTarget = new THREE.Vector3(-6, 1, 0);
    this.camDist = CAMERA.minDist;
    this.shake = 0;
    this.heistT = 0;
    this.stats = null;
    window.__game = this;
  }

  async init() {
    const bar = document.querySelector('#loading .bar i');
    this.assets = await loadAssets(this.renderer, (p) => { bar.style.width = `${Math.round(p * 100)}%`; });
    initMaterials(this.assets.tex);
    this.setupScene();
    this.level = new Level(this);
    this.level.build(this.assets);
    this.decor = new Decor(this);
    this.decor.build(this.assets);
    this.fx = new Fx(this.scene);
    this.sound = new Sound(this.assets.audio);
    this.hud = new Hud(this);
    for (let i = 0; i < 4; i++) {
      const [x, y] = LEVEL.spawn[i];
      const t = new Thief(this, i, PLAYER_COLORS[i], x, y);
      t.bot = new Bot(this, t);
      t.cp = 0;
      this.thieves.push(t);
    }
    this.setupComposer();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', () => this.sound.unlock());
    window.addEventListener('pointerdown', () => this.sound.unlock());
    this.resize();
    // compile shaders up front to avoid hitches
    this.renderer.compile(this.scene, this.camera);
    document.getElementById('loading').style.opacity = 0;
    setTimeout(() => document.getElementById('loading').remove(), 900);
    if (DEBUG.auto || DEBUG.bots) this.startHeist(DEBUG.bots ? [] : [new Controller('keys', 0)]);
    else this.enterTitle();
    this.last = performance.now();
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  setupScene() {
    const s = this.scene;
    s.background = new THREE.Color(0x2a2016);
    s.fog = new THREE.FogExp2(0x8a7452, 0.013);
    // image-based lighting from the fal-generated panorama
    const envTex = this.assets.tex.env || this.assets.tex.backplate;
    if (envTex) {
      envTex.mapping = THREE.EquirectangularReflectionMapping;
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.envRT = pm.fromEquirectangular(envTex);
      s.environment = this.envRT.texture;
      pm.dispose();
    }
    this.hemi = new THREE.HemisphereLight(0xffe2b0, 0x2a1a0e, 0.55);
    s.add(this.hemi);
    // the sun: warm beam entering through the great arched windows (upper right, behind)
    const sun = new THREE.DirectionalLight(0xffd59a, 3.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -26; sun.shadow.camera.right = 26;
    sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -18;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    s.add(sun); s.add(sun.target);
    this.sun = sun;
    // back light from the great windows (behind, upper right): golden rims on every edge
    const back = new THREE.DirectionalLight(0xffc878, 2.2);
    s.add(back); s.add(back.target);
    this.back = back;
    // cool-ish fill from the left to separate the thieves from the brass
    const rim = new THREE.DirectionalLight(0xbcd0ff, 0.45);
    rim.position.set(-30, 10, 18);
    s.add(rim);
    this.rim = rim;
  }

  setupComposer() {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.7, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setSize(w, h);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      const b = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      this.grade.uniforms.uRes.value.set(b.x, b.y);
    }
  }

  // ------------------------------------------------------------ states
  enterTitle() {
    this.state = 'title';
    this.joined = [null, null, null, null];
    this.resetRun();
    for (const t of this.thieves) t.isBot = true;
    this.hud.showTitle(true);
    this.hud.updateSlots(this.joined);
    this.fade(0);
  }

  startHeist(controllers) {
    if (controllers) controllers.forEach((c, i) => { this.joined[i] = c; });
    if (!this.joined.some(Boolean) && !DEBUG.bots) this.joined[0] = new Controller('keys', 0);
    this.resetRun();
    this.thieves.forEach((t, i) => { t.controller = this.joined[i]; t.isBot = !this.joined[i]; });
    if (DEBUG.x !== null) this.debugWarp(DEBUG.x);
    this.state = 'play';
    this.heistT = 0;
    this.hud.showTitle(false);
    this.hud.showHud(true);
    this.hud.banner('', '');
    this.sound.start();
    this.sound.play('bell', { gain: 0.5 });
  }

  resetRun() {
    this.level.resetState();
    this.simTime = 0;
    this.acc = 0;
    this.stats = { start: this.time, falls: [0, 0, 0, 0], gems: [0, 0, 0, 0] };
    this.thieves.forEach((t, i) => {
      const [x, y] = LEVEL.spawn[i];
      t.body.teleport(x, y);
      t.dead = false; t.koT = 0; t.victory = false; t.holding = null; t.cp = 0; t.gems = 0; t.offT = 0;
      t.setVisible(true);
      t.resetCape();
      t.bot.reset();
    });
    this.camTarget.set(-6, 1, 0);
    this.endT = 0;
  }

  debugWarp(x) {
    let cp = 0;
    LEVEL.checkpoints.forEach((c, i) => { if (c.x <= x) cp = i; });
    this.thieves.forEach((t, i) => {
      t.cp = cp;
      const c = LEVEL.checkpoints[cp];
      t.body.teleport(c.x - 1.5 + i * 0.9, c.y + 0.05);
      t.resetCape();
      t.bot.reset();
    });
    this.camTarget.set(LEVEL.checkpoints[cp].x, LEVEL.checkpoints[cp].y + 1, 0);
  }

  win(byThief) {
    if (this.state !== 'play') return;
    this.state = 'won';
    this.endT = 0;
    this.level.vault.taken = true;
    this.winner = byThief;
    for (const t of this.thieves) { t.victory = true; if (t.holding) this.release(t); }
    this.sound.play('win', { gain: 0.9 });
    this.fx.confetti(byThief.x, byThief.y + 1.5);
    const secs = Math.round(this.heistT);
    this.hud.banner('THE HEART IS YOURS', `HEIST TIME ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}  ·  ENTER TO PLAY AGAIN`, this.thieves.map((t, i) => ({ c: t.color.css, v: t.gems, l: this.joined[i] ? `P${this.playerNumber(i)} GEMS` : 'CPU GEMS' })));
  }

  lose() {
    if (this.state !== 'play') return;
    this.state = 'lost';
    this.endT = 0;
    this.sound.play('bell', { gain: 1.0 });
    setTimeout(() => this.sound.play('bell', { gain: 0.8 }), 1600);
    for (const t of this.thieves) if (t.holding) this.release(t);
    this.hud.banner('MIDNIGHT', 'THE TOWER WAKES · ENTER TO TRY AGAIN');
  }

  playerNumber(slot) { let n = 0; for (let i = 0; i <= slot; i++) if (this.joined[i]) n++; return n; }

  fade(target) { this.fadeTarget = target; }

  // ------------------------------------------------------------ input (menus)
  handleMenuInput() {
    if (this.state === 'title') {
      const ctrls = [0, 1, 2, 3].map((i) => new Controller('keys', i));
      for (const p of padIndices()) ctrls.push(new Controller('pad', p));
      for (const c of ctrls) {
        if (!c.joinPressed()) continue;
        if (this.joined.some((j) => j && j.kind === c.kind && j.index === c.index)) continue;
        const slot = this.joined.findIndex((j) => !j);
        if (slot < 0) continue;
        this.joined[slot] = c;
        this.sound.unlock();
        this.sound.play('join', { gain: 0.7 });
        this.hud.updateSlots(this.joined);
      }
      if (keyPressed('Enter') || keyPressed('NumpadEnter')) { this.sound.unlock(); this.startHeist(); }
    } else if (this.state === 'won' || this.state === 'lost') {
      if (this.endT > 1.5 && (keyPressed('Enter') || keyPressed('NumpadEnter') || keyPressed('Space'))) {
        if (this.state === 'lost') { const j = this.joined.slice(); this.startHeist(); this.joined = j; }
        else this.enterTitle();
      }
    } else if (this.state === 'play') {
      if (keyPressed('Escape')) this.enterTitle();
    }
  }

  // ------------------------------------------------------------ main loop
  frame(now) {
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    dt *= DEBUG.speed;
    this.time += dt;
    this.handleMenuInput();

    const running = this.state !== 'loading';
    if (running) {
      this.acc += dt;
      let first = true;
      let steps = 0;
      while (this.acc >= PHYS.dt && steps < 40) {
        this.fixedStep(PHYS.dt, first);
        this.acc -= PHYS.dt;
        first = false;
        steps++;
      }
    }
    if (this.state === 'play') {
      this.heistT += dt;
      if (this.heistT >= HEIST_MINUTES * 60) this.lose();
    }
    if (this.state === 'won' || this.state === 'lost') this.endT += dt;
    // attract mode: once the bots crack the vault on the title screen, start a fresh run
    if (this.state === 'title') {
      this.attractT = this.level.vault.opened ? (this.attractT || 0) + dt : 0;
      if (this.attractT > 7) { this.attractT = 0; this.resetRun(); }
    }

    // lever hints for humans standing next to a free lever
    if (this.state === 'play') for (const t of this.thieves) {
      if (t.isBot || t.dead || t.holding) continue;
      const lv = this.leverNear(t, 0.95);
      if (lv && !lv.heldBy) lv.hint = true;
    }
    this.level.updateVisual(dt, this.time);
    // the winner lifts the Clockwork Heart overhead
    if (this.state === 'won' && this.winner) {
      const tr = this.level.vault.treasure;
      const w = this.winner;
      tr.position.lerp(new THREE.Vector3(w.x, w.y + 2.0 + Math.sin(this.time * 3) * 0.1, 0.3), 1 - Math.exp(-dt * 5));
      tr.rotation.y += dt * 2.2;
      if (Math.random() < dt * 6) this.fx.sparkle(tr.position.x + (Math.random() - 0.5), tr.position.y + (Math.random() - 0.5), 0xffd27a);
    }
    this.handleLevelEvents();
    for (const t of this.thieves) this.updateThiefVisual(t, dt);
    this.updateCamera(dt);
    this.decor.update(dt, this.time, this.camera, this.heistClock());
    this.fx.update(dt, this.camera);
    this.hud.update(dt);
    this.updateLights();

    // fade
    const f = this.grade.uniforms.uFade;
    f.value += ((this.fadeTarget ?? 0) - f.value) * Math.min(1, dt * 2.5);
    this.grade.uniforms.uTime.value = this.time;
    this.composer.render(dt);
    endFrame();
  }

  /** Fraction of the heist elapsed (drives the giant clock hands). */
  heistClock() {
    if (this.state === 'play' || this.state === 'won' || this.state === 'lost') return Math.min(1, this.heistT / (HEIST_MINUTES * 60));
    return 0.15 + (this.time * 0.002) % 0.7;
  }

  fixedStep(h, first) {
    this.simTime += h;
    this.level.update(this.simTime, h);
    const playing = this.state === 'play' || this.state === 'title';
    for (const t of this.thieves) {
      if (t.dead) { this.updateDead(t, h); continue; }
      if (t.koT > 0) { this.updateKO(t, h); continue; }
      let ctl;
      if (!playing || t.victory) ctl = { move: 0, jumpPressed: false, jumpHeld: false, frozen: true };
      else if (t.isBot) ctl = t.bot.step(h, first);
      else ctl = this.humanControl(t, first);
      if (ctl && !ctl.kinematic) stepBody(t.body, this.level.world, h, ctl);
      this.postStep(t, h);
    }
  }

  humanControl(t, first) {
    const c = t.controller.read();
    const ctl = { move: c.move, jumpPressed: first && c.jumpPressed, jumpHeld: c.jumpHeld, frozen: false };
    if (t.holding) {
      if (!c.act || !t.body.grounded || Math.abs(t.x - t.holding.x) > 1.3) this.release(t);
      else { ctl.frozen = true; ctl.move = 0; ctl.jumpPressed = false; }
    } else if (c.act && t.body.grounded) {
      const lv = this.leverNear(t, 0.95);
      if (lv) { this.grab(t, lv); ctl.frozen = true; ctl.move = 0; }
    }
    return ctl;
  }

  leverNear(t, range) {
    let best = null, bd = range;
    for (const l of this.level.levers.values()) {
      if (l.heldBy && l.heldBy !== t) continue;
      const d = Math.abs(t.x - l.x);
      if (d < bd && Math.abs(t.y - l.y) < 0.6) { bd = d; best = l; }
    }
    return best;
  }

  grab(t, lever) {
    if (lever.heldBy && lever.heldBy !== t) return false;
    lever.heldBy = t;
    t.holding = lever;
    t.faceTo = Math.sign(lever.x - t.x) || 1;
    this.sound.play('lever', { x: lever.x, gain: 0.8 });
    this.fx.sparks(lever.x, lever.y + 1.0, 6);
    return true;
  }

  release(t) {
    const l = t.holding;
    if (!l) return;
    if (l.heldBy === t) l.heldBy = null;
    t.holding = null;
    this.sound.play('leverUp', { x: l.x, gain: 0.6 });
  }

  postStep(t, h) {
    const b = t.body;
    if (b.jumpedThisStep) { t.jumpImpulse(); this.sound.play('jump', { x: t.x, gain: 0.35, rate: 0.9 + Math.random() * 0.25 }); }
    if (b.landedThisStep) {
      t.landImpact(b.lastLandSpeed);
      if (b.lastLandSpeed > 6) { this.fx.dust(t.x, t.y, Math.min(14, 4 + b.lastLandSpeed * 0.4)); this.sound.play('land', { x: t.x, gain: Math.min(0.5, b.lastLandSpeed * 0.03) }); }
    }
    // checkpoints
    for (let i = t.cp + 1; i < LEVEL.checkpoints.length; i++) {
      const c = LEVEL.checkpoints[i];
      if (t.x > c.trigger && b.grounded) t.cp = i;
    }
    // gems
    for (const g of this.level.gems) {
      if (g.taken) continue;
      if (Math.abs(g.x - t.x) < 0.6 && Math.abs(g.y - (t.y + 0.5)) < 0.85) {
        g.taken = true; g.t = 0;
        t.gems++;
        this.sound.play('gem', { x: g.x, gain: 0.5, rate: 0.95 + Math.random() * 0.15 });
        this.fx.sparkle(g.x, g.y, t.color.hex);
      }
    }
    // pendulum hazard
    for (const p of this.level.pendulums) {
      if (!p.def.hazard) continue;
      const dx = t.x - p.x, dy = t.y + 0.5 - p.y;
      if (dx * dx + dy * dy < (p.def.bobR + 0.32) ** 2) { this.knockOut(t, Math.sign(p.vx || dx) || 1); return; }
    }
    // fell into the abyss
    if (b.y < LEVEL.killY) { this.killThief(t, 'fall'); return; }
    // treasure
    if (this.state === 'play' && this.level.treasureReachable()) {
      const tr = this.level.vault.treasure.position;
      if (Math.abs(t.x - tr.x) < 1.1 && Math.abs(t.y + 0.5 - tr.y) < 1.6 && b.grounded) this.win(t);
    }
  }

  knockOut(t, dir) {
    if (t.holding) this.release(t);
    t.koT = 1.1;
    t.koVel = new THREE.Vector3(dir * 7, 7.5, 9);
    t.koSpin = (Math.random() - 0.5) * 18;
    this.shake = Math.max(this.shake, 0.35);
    this.sound.play('bonk', { x: t.x, gain: 0.8 });
    this.fx.stars(t.x, t.y + 0.8);
    if (this.stats) this.stats.falls[t.slot]++;
  }

  updateKO(t, h) {
    t.koT -= h;
    t.koVel.y -= 22 * h;
    t.root.position.addScaledVector(t.koVel, h);
    t.pivot.rotation.x += t.koSpin * h;
    if (t.koT <= 0) { t.pivot.rotation.x = 0; this.killThief(t, 'ko'); }
  }

  killThief(t, why) {
    if (t.holding) this.release(t);
    t.dead = true;
    t.respawnT = why === 'fall' ? 0.9 : 0.4;
    t.koT = 0;
    t.setVisible(false);
    if (why === 'fall') { this.sound.play('swoosh', { x: t.x, gain: 0.25, rate: 0.7 }); if (this.stats) this.stats.falls[t.slot]++; }
  }

  updateDead(t, h) {
    t.respawnT -= h;
    if (t.respawnT > 0) return;
    const c = LEVEL.checkpoints[t.cp];
    t.body.teleport(c.x + (t.slot - 1.5) * 0.55, c.y + 0.6);
    t.dead = false;
    t.setVisible(true);
    t.resetCape();
    t.bot.onRespawn();
    this.fx.poof(t.x, t.y + 0.5, t.color.hex);
    this.sound.play('respawn', { x: t.x, gain: 0.45 });
  }

  /** Called when a human drifts out of the shared camera for too long: hop them to a teammate. */
  rescue(t) {
    const mates = this.thieves.filter((o) => o !== t && !o.dead && o.body.grounded && !o.isBot);
    const pool = mates.length ? mates : this.thieves.filter((o) => o !== t && !o.dead && o.body.grounded);
    if (!pool.length) return;
    const m = pool.reduce((a, b) => (Math.abs(b.x - this.camTarget.x) < Math.abs(a.x - this.camTarget.x) ? b : a));
    this.fx.poof(t.x, t.y + 0.5, t.color.hex);
    if (t.holding) this.release(t);
    t.body.teleport(m.x, m.y + 0.6);
    t.resetCape();
    this.fx.poof(t.x, t.y + 0.5, t.color.hex);
  }

  handleLevelEvents() {
    for (const e of this.level.events) {
      if (e.type === 'gate') { this.sound.play('gate', { x: e.x, gain: 0.7 }); this.shake = Math.max(this.shake, 0.12); }
      else if (e.type === 'swoosh') this.sound.play('swoosh', { x: e.x, gain: 0.3, rate: 0.8 + Math.random() * 0.2 });
      else if (e.type === 'bridge') this.sound.play('bridge', { x: e.x, gain: 0.55 });
      else if (e.type === 'brake' || e.type === 'unbrake') this.sound.play('gate', { x: e.x, gain: 0.35, rate: 1.4 });
      else if (e.type === 'vault') {
        this.sound.play('vault', { x: e.x, gain: 1.0 });
        setTimeout(() => this.sound.play('bell', { gain: 0.6 }), 600);
        this.shake = Math.max(this.shake, 0.5);
        this.fx.sparks(e.x, e.y, 30);
        for (const t of this.thieves) if (t.holding && t.holding.def.vault) this.release(t);
      }
    }
    this.level.events.length = 0;
  }

  // ------------------------------------------------------------ visuals
  updateThiefVisual(t, dt) {
    if (t.dead) return;
    if (t.koT > 0) { t.mixer.update(dt); return; }
    const b = t.body;
    const vx = b.vx + b.carryVX;
    let faceDir = Math.abs(b.vx) > 0.4 ? Math.sign(b.vx) : 0;
    if (t.isBot && t.bot.faceDir) faceDir = t.bot.faceDir;
    if (t.holding) faceDir = Math.sign(t.holding.x - t.x) || t.facing;
    t.updateVisual(dt, { vx: b.vx, vy: b.vy, grounded: b.grounded, moving: Math.abs(b.vx) > 0.5, faceDir, waving: false });
  }

  updateCamera(dt) {
    const cam = this.camera;
    const focus = [];
    const humans = this.thieves.filter((t) => !t.isBot && !t.dead && t.koT <= 0);
    const list = humans.length ? humans : this.thieves.filter((t) => !t.dead && t.koT <= 0);
    for (const t of list) focus.push(t);
    // include bots that are close to the human group
    if (humans.length) {
      const hx = humans.reduce((s, t) => s + t.x, 0) / humans.length;
      for (const t of this.thieves) if (t.isBot && !t.dead && Math.abs(t.x - hx) < 12) focus.push(t);
    }
    if (this.state === 'won' && this.winner) { focus.length = 0; focus.push(this.winner); }
    if (focus.length) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const t of focus) { minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x); minY = Math.min(minY, t.y); maxY = Math.max(maxY, t.y); }
      const facing = list.reduce((s, t) => s + t.facing, 0) / Math.max(1, list.length);
      const tx = THREE.MathUtils.clamp((minX + maxX) / 2 + facing * CAMERA.lookAhead, LEVEL.camBounds.minX, LEVEL.camBounds.maxX);
      const ty = (minY + maxY) / 2 + 1.7;
      const k = 1 - Math.exp(-dt * 3.2);
      this.camTarget.x += (tx - this.camTarget.x) * k;
      this.camTarget.y += (ty - this.camTarget.y) * (1 - Math.exp(-dt * 2.2));
      const vfov = THREE.MathUtils.degToRad(cam.fov);
      const hTan = Math.tan(vfov / 2) * cam.aspect;
      const spanX = maxX - minX + 9, spanY = maxY - minY + 6.5;
      let want = Math.max(spanX / 2 / hTan, spanY / 2 / Math.tan(vfov / 2), CAMERA.minDist);
      if (this.state === 'won') want = CAMERA.minDist * 0.75;
      want = Math.min(CAMERA.maxDist, want);
      this.camDist += (want - this.camDist) * (1 - Math.exp(-dt * 1.6));
    }
    this.shake = Math.max(0, this.shake - dt * 1.4);
    const sh = this.shake * this.shake;
    const sx = (Math.random() - 0.5) * sh, sy = (Math.random() - 0.5) * sh;
    const sway = Math.sin(this.time * 0.23) * 0.35;
    cam.position.set(this.camTarget.x + sx + sway * 0.4, this.camTarget.y + CAMERA.height + sy, this.camDist);
    cam.lookAt(this.camTarget.x + sway * 0.25, this.camTarget.y + 0.25, 0);
    // humans lost off-screen get hopped back to the group
    if (this.state === 'play') {
      const half = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * cam.aspect * this.camDist;
      for (const t of humans) {
        const off = Math.abs(t.x - this.camTarget.x) > half + 0.8 || t.y < this.camTarget.y - 14;
        t.offT = off ? (t.offT || 0) + dt : 0;
        if (t.offT > 2.2) { t.offT = 0; this.rescue(t); }
      }
    }
  }

  updateLights() {
    const c = this.camTarget;
    this.sun.position.set(c.x + 20, c.y + 30, 24);
    this.sun.target.position.set(c.x, c.y, 0);
    this.sun.target.updateMatrixWorld();
    this.back.position.set(c.x + 24, c.y + 26, -30);
    this.back.target.position.set(c.x, c.y, 0);
    this.back.target.updateMatrixWorld();
    // halls are lit by candles, the open tower by the sun
    const inHall = this.decor.hallFactor(c.x);
    this.sun.intensity = THREE.MathUtils.lerp(2.6, 0.35, inHall);
    this.back.intensity = THREE.MathUtils.lerp(2.2, 0.2, inHall);
    this.hemi.intensity = THREE.MathUtils.lerp(0.55, 0.5, inHall);
    this.scene.fog.density = THREE.MathUtils.lerp(0.013, 0.0075, inHall);
  }
}

const game = new Game();
game.init().catch((e) => { console.error(e); const l = document.getElementById('loading'); if (l) l.innerHTML = `<div style="color:#f88;font:14px monospace;padding:20px">${e.message}</div>`; });
