// validate.js: checks a spec before main.js builds the film, so a mistake reads as one line naming the scene
// and the option instead of a crash inside a block. checkSpec(spec) returns [{ level, msg }]:
// an 'error' stops the boot (info.mjs exits 1 and lists it), a 'warning' is printed and the film still builds.
// Custom blocks are fine: any subclass of Scene passes, wherever it is defined.
import { Scene, Words, Picture, Stretch, Notes, Progress, Logo, SHOT_STYLES } from './blocks.js';

const HEX6 = /^#[0-9a-f]{6}$/i;
const RGB = /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/i;
const TWO_PART = new Set(['stack', 'pair', 'split']);
const EXITS = new Set(['zoom', 'collapse', 'flash']);
const num = v => typeof v === 'number' && Number.isFinite(v);
const show = v => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v) ?? String(v));
export const isBlock = S => typeof S === 'function' && (S === Scene || S.prototype instanceof Scene);
const is = (S, Base) => isBlock(S) && (S === Base || S.prototype instanceof Base);

export function checkSpec(spec) {
  const out = [];
  const error = msg => out.push({ level: 'error', msg });
  const warn = msg => out.push({ level: 'warning', msg });
  if (!spec || typeof spec !== 'object') {
    error('spec.js must `export default` an object');
    return out;
  }
  if (!(num(spec.bpm) && spec.bpm > 0)) error(`bpm must be a number above 0, not ${show(spec.bpm)}`);
  if (!(num(spec.beats) && spec.beats > 0)) error(`beats must be a number above 0, not ${show(spec.beats)}`);
  const beats = num(spec.beats) && spec.beats > 0 ? spec.beats : Infinity;
  const inFilm = k => num(k) && k >= 0 && k <= beats;
  if (spec.fps !== undefined) {
    if (!(num(spec.fps) && spec.fps > 0)) error(`fps must be a number above 0, not ${show(spec.fps)}`);
    else if (spec.fps !== 60) warn(`fps is ${spec.fps}: the HUD and finish.py's motion target assume 60`);
  }
  // the palette is mixed into derived colors, and only #RRGGBB and rgb() parse without a canvas
  for (const [k, v] of Object.entries(spec.palette || {}))
    if (!(typeof v === 'string' && (HEX6.test(v) || RGB.test(v)))) error(`palette.${k} is ${show(v)}: use a 6-digit hex color (#RRGGBB) or rgb()`);

  if (!Array.isArray(spec.scenes) || !spec.scenes.length) error('scenes must be a non-empty list of [Block, startBeat, endBeat, options]');
  let logoStart = null;
  (Array.isArray(spec.scenes) ? spec.scenes : []).forEach((sc, i) => {
    const [S, k0, k1, o = {}] = Array.isArray(sc) ? sc : [];
    const name = `scene ${i + 1} (${(S && S.name) || 'unknown'} ${show(k0)}-${show(k1)})`;
    if (!isBlock(S)) return error(`${name}: the first entry must be a block class (a subclass of Scene), not ${show(S)}`);
    if (!(num(k0) && num(k1) && k0 >= 0 && k0 < k1)) return error(`${name}: needs 0 <= startBeat < endBeat`);
    if (k1 > beats) error(`${name}: ends after the film's last beat (${beats})`);
    if (o === null || typeof o !== 'object') return error(`${name}: options must be an object`);
    if (S.endCard) logoStart = logoStart === null ? k0 : Math.max(logoStart, k0);
    if (is(S, Words)) checkWords(o, k0, k1, name, error);
    if (is(S, Picture) && !(typeof o.src === 'string' && o.src)) error(`${name}: Picture needs src, the image path`);
    // the film's words are the user's: these blocks have no placeholder copy to fall back on
    if (is(S, Stretch) && !(typeof o.word === 'string' && o.word)) error(`${name}: Stretch needs word: 'ONE WORD.'`);
    if (is(S, Notes) && !(typeof o.preview === 'string' && o.preview)) error(`${name}: Notes needs preview, the word in the preview window`);
    if (is(S, Progress) && !(Array.isArray(o.lines) && o.lines.length === 2 && o.lines.every(l => typeof l === 'string')))
      error(`${name}: Progress needs lines: ['FIRST', 'SECOND LINE.']`);
    if (is(S, Logo) && spec.logo === undefined && o.mark) warn(`${name}: mark ids are set but spec.logo names no SVG file`);
  });

  (spec.captions || []).forEach((c, i) => {
    const [a, b, words] = Array.isArray(c) ? c : [];
    if (!(inFilm(a) && inFilm(b) && a < b)) return error(`caption ${i + 1}: needs 0 <= startBeat < endBeat <= beats (${beats})`);
    if (!Array.isArray(words) || words.some(w => !Array.isArray(w) || typeof w[0] !== 'string' || !num(w[1])))
      error(`caption ${i + 1}: words must be [['word', beat], ...]`);
  });
  (spec.cues || []).forEach((c, i) => {
    const [k, name, gain] = Array.isArray(c) ? c : [];
    if (!inFilm(k) || typeof name !== 'string' || !name || (gain !== undefined && !num(gain)))
      error(`cue ${i + 1} ${show(c)}: needs [beat within 0-${beats}, 'sound name', gain]`);
  });
  if (spec.hudOut !== undefined) {
    const [a, b] = Array.isArray(spec.hudOut) ? spec.hudOut : [];
    if (!(inFilm(a) && inFilm(b) && a < b)) error(`hudOut ${show(spec.hudOut)}: needs [startBeat, endBeat] within 0-${beats}`);
  }
  for (const [k, v] of Object.entries(spec.sounds || {})) if (!num(v)) error(`sounds.${k} must be a level in dB, not ${show(v)}`);

  const m = spec.music;
  if (m !== undefined && m !== null) {
    if (typeof m.file !== 'string' || !m.file) error('music.file must name the track (audio/music.mp3)');
    if (m.offset !== undefined && !(num(m.offset) && m.offset >= 0)) error(`music.offset must be seconds, 0 or more, not ${show(m.offset)}`);
    if (m.gain !== undefined && !num(m.gain)) error(`music.gain must be a level in dB, not ${show(m.gain)}`);
    if (m.stopBeat !== undefined) {
      if (!(num(m.stopBeat) && m.stopBeat > 0 && m.stopBeat <= beats)) error(`music.stopBeat ${show(m.stopBeat)} must lie within the film (1-${beats})`);
      else if (logoStart !== null && m.stopBeat !== logoStart + 1)
        warn(`music.stopBeat is ${m.stopBeat}: the music usually stops dead on the logo hit, beat ${logoStart + 1}`);
    }
  }
  if (spec.logo !== undefined && !(typeof spec.logo === 'string' && spec.logo)) error('logo must be the path of an SVG file');
  return out;
}

function checkWords(o, k0, k1, name, error) {
  if (!Array.isArray(o.shots) || !o.shots.length) return error(`${name}: Words needs shots: [{ at, style, text }, ...]`);
  let last = -Infinity;
  o.shots.forEach((s, j) => {
    const where = `${name} shot ${j + 1}`;
    if (!s || typeof s !== 'object') return error(`${where}: must be an object`);
    if (!num(s.at) || s.at < k0 || s.at >= k1) error(`${where}: at ${show(s.at)} must lie inside the block (${k0} to below ${k1})`);
    else if (s.at <= last) error(`${where}: at ${s.at} must come after the previous shot (${last})`);
    if (num(s.at)) last = Math.max(last, s.at);
    const style = s.style ?? 'slam';
    if (!SHOT_STYLES.includes(style)) return error(`${where}: style ${show(style)} is not one of ${SHOT_STYLES.join(', ')}`);
    const pair = Array.isArray(s.text) && s.text.length === 2 && s.text.every(t => typeof t === 'string');
    if (TWO_PART.has(style) && !pair) error(`${where}: style '${style}' takes text: ['first', 'second']`);
    if (!TWO_PART.has(style) && typeof s.text !== 'string') error(`${where}: style '${style}' takes text: 'ONE STRING'`);
  });
  if (o.exit !== undefined && !(o.exit && EXITS.has(o.exit.type))) error(`${name}: exit.type must be one of ${[...EXITS].join(', ')}`);
}
