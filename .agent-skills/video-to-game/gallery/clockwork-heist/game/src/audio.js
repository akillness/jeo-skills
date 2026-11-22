// WebAudio playback of the fal-generated music + sound effects (stereo-panned by screen position).
export class Sound {
  constructor(raw) {
    this.raw = raw || {};
    this.ctx = null;
    this.buf = {};
    this.musicStarted = false;
    this.camX = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 1.0; this.sfxBus.connect(this.master);
      this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.42; this.musicBus.connect(this.master);
      for (const [k, ab] of Object.entries(this.raw)) {
        if (!ab) continue;
        this.ctx.decodeAudioData(ab.slice(0)).then((b) => {
          this.buf[k] = b;
          if (k === 'music' && this.wantMusic) this.startMusic();
          if (k === 'tick' && this.wantMusic) this.startTick();
        }).catch(() => {});
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.wantMusic = true;
    this.startMusic();
    this.startTick();
  }

  start() { this.unlock(); }

  startMusic() {
    if (this.musicStarted || !this.buf.music) return;
    this.musicStarted = true;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf.music;
    s.loop = true;
    s.connect(this.musicBus);
    s.start();
  }

  startTick() {
    if (this.tickStarted || !this.buf.tick) return;
    this.tickStarted = true;
    const s = this.ctx.createBufferSource();
    s.buffer = this.buf.tick;
    s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0.16;
    s.connect(g); g.connect(this.master);
    s.start();
  }

  play(name, { x = null, gain = 1, rate = 1 } = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const b = this.buf[name];
    if (!b) return;
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    let node = s;
    if (x !== null && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-0.85, Math.min(0.85, (x - this.camX) / 16));
      s.connect(p); node = p;
      // far away sounds are quieter
      g.gain.value *= Math.max(0.15, 1 - Math.abs(x - this.camX) / 40);
    }
    node.connect(g);
    g.connect(this.sfxBus);
    s.start();
  }
}
