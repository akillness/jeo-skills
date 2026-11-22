// Minimal DOM overlay: title slots, player pips (gems / lever held), heist clock, end banner,
// plus small world-anchored tags (who is who, and a "hold" prompt next to a free lever).
import * as THREE from 'three';
import { PLAYER_COLORS, KEY_SCHEMES, HEIST_MINUTES } from './config.js';

const _p = new THREE.Vector3();
function keyName(code) {
  if (!code) return 'X';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  return { ArrowDown: '▼', ArrowUp: '▲', ArrowLeft: '◀', ArrowRight: '▶', ShiftRight: 'SHIFT' }[code] || code;
}

export class Hud {
  constructor(game) {
    this.game = game;
    this.title = document.getElementById('title');
    this.hud = document.getElementById('hud');
    this.bannerEl = document.getElementById('banner');
    this.clock = this.hud.querySelector('.clock');
    this.pips = this.hud.querySelector('.pips');
    document.getElementById('logo').src = 'assets/tex/logo.webp';
    const slots = document.getElementById('slots');
    this.slotEls = PLAYER_COLORS.map((c, i) => {
      const d = document.createElement('div');
      d.className = 'slot';
      d.style.setProperty('--c', c.css);
      d.innerHTML = `<div class="hood" style="background:${c.css}"></div><b>CPU</b><span>${KEY_SCHEMES[i].label}</span>`;
      slots.appendChild(d);
      return d;
    });
    this.tagLayer = document.getElementById('tags');
    this.playerTags = PLAYER_COLORS.map((c) => {
      const d = document.createElement('div');
      d.className = 'tag';
      d.style.setProperty('--c', c.css);
      this.tagLayer.appendChild(d);
      return d;
    });
    this.leverTags = PLAYER_COLORS.map((c) => {
      const d = document.createElement('div');
      d.className = 'tag lever';
      d.style.setProperty('--c', c.css);
      this.tagLayer.appendChild(d);
      return d;
    });
    this.pipEls = PLAYER_COLORS.map((c) => {
      const d = document.createElement('div');
      d.className = 'pip';
      d.style.setProperty('--c', c.css);
      d.innerHTML = '<i></i><span>0</span><em></em>';
      this.pips.appendChild(d);
      return d;
    });
  }

  showTitle(v) { this.title.style.opacity = v ? 1 : 0; if (v) { this.showHud(false); this.banner('', ''); } }
  showHud(v) { this.hud.style.opacity = v ? 1 : 0; }

  updateSlots(joined) {
    let n = 0;
    joined.forEach((c, i) => {
      const el = this.slotEls[i];
      el.classList.toggle('on', !!c);
      if (c) n++;
      el.querySelector('b').textContent = c ? `P${n}` : 'CPU';
      el.querySelector('span').textContent = c ? c.label : `JOIN · ${KEY_SCHEMES[i].label}`;
    });
    this.pipEls.forEach((el, i) => { el.querySelector('em').textContent = joined[i] ? `P${this.game.playerNumber(i)}` : 'CPU'; });
  }

  banner(title, sub, stats) {
    if (!title) { this.bannerEl.style.opacity = 0; return; }
    this.bannerEl.querySelector('h1').textContent = title;
    this.bannerEl.querySelector('p').textContent = sub || '';
    const st = this.bannerEl.querySelector('.stats');
    st.innerHTML = '';
    if (stats) for (const s of stats) {
      const d = document.createElement('div');
      d.className = 'stat';
      d.style.setProperty('--c', s.c);
      d.innerHTML = `${s.v}<small>${s.l}</small>`;
      st.appendChild(d);
    }
    this.bannerEl.style.opacity = 1;
  }

  update() {
    const g = this.game;
    if (g.state === 'play' || g.state === 'won' || g.state === 'lost') {
      g.thieves.forEach((t, i) => {
        const el = this.pipEls[i];
        el.querySelector('span').textContent = t.gems;
        el.classList.toggle('held', !!t.holding);
      });
      const total = HEIST_MINUTES * 60;
      const left = Math.max(0, total - g.heistT);
      const elapsedMin = (g.heistT / 60);
      const mm = Math.floor(50 + elapsedMin * (10 / HEIST_MINUTES));
      const clockMin = Math.min(59, mm);
      const hh = g.heistT >= total ? '12:00' : `11:${String(clockMin).padStart(2, '0')}`;
      this.clock.textContent = hh;
      this.clock.classList.toggle('late', left < 60 && g.state === 'play');
    }
    this.game.sound.camX = g.camTarget.x;
    this.updateTags();
  }

  screen(x, y, z = 0) {
    _p.set(x, y, z).project(this.game.camera);
    return { x: (_p.x * 0.5 + 0.5) * window.innerWidth, y: (-_p.y * 0.5 + 0.5) * window.innerHeight, ok: _p.z < 1 };
  }

  updateTags() {
    const g = this.game;
    const playing = g.state === 'play';
    g.thieves.forEach((t, i) => {
      const tag = this.playerTags[i], lt = this.leverTags[i];
      if (!playing || t.isBot || t.dead || t.koT > 0) { tag.style.opacity = 0; lt.style.opacity = 0; return; }
      const s = this.screen(t.x, t.y + 1.75);
      tag.textContent = `P${g.playerNumber(i)}`;
      tag.style.left = `${s.x}px`; tag.style.top = `${s.y}px`;
      tag.style.opacity = 0.85;
      // lever prompt
      const lv = t.holding || g.leverNear(t, 0.95);
      if (lv && (!lv.heldBy || lv.heldBy === t)) {
        const c = t.controller;
        const key = c.kind === 'keys' ? keyName(KEY_SCHEMES[c.index].act[0]) : 'X';
        const ls = this.screen(lv.x, lv.y + 1.65);
        lt.textContent = t.holding ? 'HOLDING' : `HOLD ${key}`;
        lt.style.left = `${ls.x}px`; lt.style.top = `${ls.y}px`;
        lt.style.opacity = 1;
      } else lt.style.opacity = 0;
    });
  }
}
