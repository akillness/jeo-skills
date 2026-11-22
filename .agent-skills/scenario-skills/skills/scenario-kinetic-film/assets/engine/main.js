// main.js: boot a film. Loads spec.js (the film), checks it, loads fonts, the logo and the film's own source,
// builds it, and exposes __seek / __samples / __shutter for the renderer and a scrubber for previewing.
// Every boot ends with window.__ready set, so the scripts never wait out a timeout: when the film cannot be
// built, window.__problems says why ({ level: 'error' | 'warning', msg }) and window.__film stays unset.
import { configure, setPalette, DUR, FPS, BPM } from './core.js';
import { Film } from './compositor.js';
import { inertSvg } from './sanitize.js';
import { checkSpec } from './validate.js';

const FONTS = ['900 100px Archivo', '500 20px JBM', '700 30px Inst', '400 30px Inst'];
const problems = (window.__problems = []);
const report = (level, msg) => {
  problems.push({ level, msg });
  (level === 'error' ? console.error : console.warn)(`${level}: ${msg}`);
};

async function boot() {
  const spec = (await import('./spec.js')).default;
  for (const p of checkSpec(spec)) report(p.level, p.msg);
  if (problems.some(p => p.level === 'error')) return null;
  configure(spec);
  setPalette(spec.palette || {});
  // a missing font rejects its load: report it instead of measuring every word in a fallback face
  const loads = await Promise.allSettled(FONTS.map(f => document.fonts.load(f)));
  const missing = FONTS.filter((f, i) => loads[i].status === 'rejected' || !document.fonts.check(f));
  if (missing.length) {
    report('error', `fonts missing (${missing.join(', ')}): run scripts/get_fonts.sh <film folder>`);
    return null;
  }
  // the film's own source, for the Counters block and {lines}; new files go last so the first two stay spec + blocks
  // one at a time: a burst of requests once had a connection reset by `python3 -m http.server`
  const files = ['spec.js', 'blocks.js', 'core.js', 'compositor.js', 'main.js', 'index.html', 'sanitize.js', 'validate.js'];
  const texts = [];
  for (const u of files) texts.push(await fetch(u).then(r => (r.ok ? r.text() : '')));
  const src = { code: texts.slice(0, 2).join('\n'), lines: texts.reduce((n, s) => n + (s ? s.trimEnd().split('\n').length : 0), 0) };
  const logo = spec.logo ? await fetch(spec.logo).then(r => (r.ok ? r.text() : '')).then(t => inertSvg(t)) : '';
  if (spec.logo && !logo) report('warning', `logo ${spec.logo} is missing or not an SVG: the Logo block types a wordmark`);
  const film = new Film(document.getElementById('root'), { src, logo, spec });
  window.__film = { title: spec.title || '', dur: DUR, fps: FPS, bpm: BPM, cues: film.cues, lines: src.lines, cuts: film.cuts(),
    endCard: film.endCard(), music: spec.music || null, sounds: spec.sounds || {} };
  window.__samples = (t, dt) => film.samples(t, dt);
  window.__shutter = t => film.shutter(t);
  window.__seek = t => film.render(t);
  film.render(0);
  return film;
}

let film = null;
try {
  film = await boot();
} catch (e) {
  report('error', `the film did not build: ${(e && e.stack) || e}`);
}
window.__ready = true;

// preview: space plays, arrows step one beat, 0-9 jump to tenths of the film, ?t=12 starts at 12 s
if (!location.search.includes('render') && !film) {
  const box = document.createElement('pre');
  box.className = 'problems';
  box.textContent = problems.map(p => `${p.level}: ${p.msg}`).join('\n');
  document.body.appendChild(box);
} else if (!location.search.includes('render')) {
  let t = +(new URLSearchParams(location.search).get('t') || 0), playing = false, last = 0;
  const bar = document.createElement('input');
  Object.assign(bar, { type: 'range', min: 0, max: DUR, step: 1 / FPS, value: t });
  bar.className = 'scrub'; document.body.appendChild(bar);
  const label = document.createElement('div'); label.className = 'scrubt'; document.body.appendChild(label);
  const show = () => { film.render(t); bar.value = t; label.textContent = `${t.toFixed(2)} s  ·  beat ${(t * BPM / 60).toFixed(1)}`; };
  bar.oninput = () => { t = +bar.value; show(); };
  addEventListener('keydown', e => {
    if (e.code === 'Space') { playing = !playing; last = performance.now(); e.preventDefault(); }
    if (e.code === 'ArrowRight') { t = Math.min(DUR, t + 60 / BPM); show(); }
    if (e.code === 'ArrowLeft') { t = Math.max(0, t - 60 / BPM); show(); }
    if (/^Digit\d$/.test(e.code)) { t = DUR * (+e.code.slice(5)) / 10; show(); }
  });
  const loop = now => { if (playing) { t += (now - last) / 1000; if (t > DUR) t = 0; show(); } last = now; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  show();
}
