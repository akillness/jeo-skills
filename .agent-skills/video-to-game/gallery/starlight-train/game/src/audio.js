// Small WebAudio mixer: music loop, train ambience loop, one-shot SFX.
// Sounds are decoded with an OfflineAudioContext at load time; the real AudioContext is only
// created on the first user gesture (no autoplay warnings), then the loops start.
export class Audio {
  constructor() {
    this.ctx = null; this.buf = {}; this.muted = false; this.musicSrc = null; this.ambSrc = null;
    this.levels = { music: 0, amb: 0, sfx: 0.9 };
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    this.decoder = OAC ? new OAC(2, 44100, 44100) : null;
  }
  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  _create() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9; this.master.connect(c.destination);
    this.music = c.createGain(); this.music.gain.value = this.levels.music; this.music.connect(this.master);
    this.amb = c.createGain(); this.amb.gain.value = this.levels.amb; this.amb.connect(this.master);
    this.sfx = c.createGain(); this.sfx.gain.value = this.levels.sfx; this.sfx.connect(this.master);
  }
  // call from a user gesture (key, click, gamepad start)
  resume() {
    this._create();
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') this.ctx.resume().then(() => this.startLoops()).catch(() => {});
    else this.startLoops();
  }
  async load(map, onEach) {
    await Promise.all(Object.entries(map).map(async ([k, url]) => {
      try {
        const r = await fetch(url);
        const ab = await r.arrayBuffer();
        if (this.decoder) this.buf[k] = await new Promise((res, rej) => this.decoder.decodeAudioData(ab, res, rej));
      } catch (e) { /* audio is optional */ }
      onEach && onEach();
    }));
  }
  play(name, { vol = 1, rate = 1, delay = 0 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running' || !this.buf[name] || this.muted) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf[name];
    s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.sfx);
    s.start(this.ctx.currentTime + delay);
    return { s, g };
  }
  startLoops() {
    if (!this.ctx) return;
    if (!this.musicSrc && this.buf.music) {
      const s = this.ctx.createBufferSource(); s.buffer = this.buf.music; s.loop = true; s.connect(this.music); s.start(); this.musicSrc = s;
    }
    if (!this.ambSrc && this.buf.train) {
      const s = this.ctx.createBufferSource(); s.buffer = this.buf.train; s.loop = true; s.connect(this.amb); s.start(); this.ambSrc = s;
    }
  }
  // bus: 'music' | 'amb'
  fade(bus, v, time = 1.2) {
    this.levels[bus] = v;
    if (!this.ctx) return;
    const node = this[bus];
    const t = this.ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(node.gain.value, t);
    node.gain.linearRampToValueAtTime(v, t + time);
  }
  setMuted(m) {
    this.muted = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(m ? 0 : 0.9, t + 0.3);
  }
}
