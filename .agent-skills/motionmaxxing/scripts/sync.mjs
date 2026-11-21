#!/usr/bin/env node
// sync.mjs - turn word timings into a frame table + on-screen onset frames for cutting picture to a voice.
//
// Usage:  node sync.mjs words.json [--fps 30] [--lead 2] [--out beats.json] [--index lines.index.json] [--quiet]
//   words.json   [{"word","start","end"}] seconds (from voice.py vo / vo-local); {"words":[...]} also accepted.
//                If <stem>.lines.json sits next to it ("vo.words.json" -> "vo.lines.json") its lines are added too.
//                If lines.index.json (from `voice.py split`) is found next to it, in ./vo or ./lines, or given with --index FILE,
//                a CLIP TABLE is printed (and added to beats.json as "clips"): per line the speech onset frame, the frame to put
//                the clip at (= speech frame - clip lead) and the mix.py argument  --vo clip@seconds.
//   --fps N      frame rate of the film (default 30)
//   --lead N     on-screen text should land N frames BEFORE the word is heard (default 2)
// Prints a table: word | start frame | end frame | onset frame (= start - lead, clamped at 0).
// Writes beats.json (next to words.json unless --out) and beats.js (`window.BEATS = {...}`, loadable with a <script src>
// from file:// pages where fetch() of local JSON is blocked).
// Exit: 0 ok, 1 error.
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = { fps: 30, lead: 2, out: null, quiet: false, index: null }, pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') { console.log(fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
  else if (a === '--quiet') opt.quiet = true;
  else if (a === '--fps' || a === '--lead' || a === '--out' || a === '--index') opt[a.slice(2)] = argv[++i];
  else if (a.startsWith('--')) { console.error(`error: unknown option ${a} (try --help)`); process.exit(1); }
  else pos.push(a);
}
const fail = (m) => { console.error('error: ' + m); process.exit(1); };
if (!pos[0]) fail('usage: node sync.mjs words.json [--fps 30] [--lead 2]');
const fps = Number(opt.fps), lead = Number(opt.lead);
if (!(fps > 0)) fail('--fps must be > 0');
if (!Number.isFinite(lead) || lead < 0) fail('--lead must be >= 0');
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fail(`cannot read ${f}: ${e.message}`); } };
const raw = readJson(pos[0]);
const list = Array.isArray(raw) ? raw : raw.words;
if (!Array.isArray(list) || !list.length) fail('no words found in ' + pos[0]);

const fr = (s) => Math.round(s * fps);
const mark = (o, text) => {
  const s = fr(o.start), e = Math.max(fr(o.end), s + 1);
  return { ...text, start: +o.start.toFixed(3), end: +o.end.toFixed(3), startFrame: s, endFrame: e, durFrames: e - s, onsetFrame: Math.max(0, s - lead) };
};
list.forEach((w, i) => { if (typeof w.start !== 'number' || typeof w.end !== 'number' || w.end < w.start) fail(`bad timing at word #${i} (${JSON.stringify(w)})`); });
const words = list.map((w, i) => mark(w, { i, word: w.word }));
let lines = [];
const linesFile = pos[0].replace(/\.words\.json$/, '.lines.json');
if (linesFile !== pos[0] && fs.existsSync(linesFile)) {
  lines = readJson(linesFile).map((l, i) => {
    const ws = words.filter((w) => w.start >= l.start - 0.001 && w.end <= l.end + 0.001);
    return mark(l, { i, text: l.text, firstWord: ws.length ? ws[0].i : null, lastWord: ws.length ? ws[ws.length - 1].i : null });
  });
}
let clips = [];
const idxFile = opt.index || ['.', 'vo', 'lines'].map((d) => path.join(path.dirname(pos[0]), d, 'lines.index.json')).find((f) => fs.existsSync(f));
if (opt.index && !fs.existsSync(opt.index)) fail(`index not found: ${opt.index}`);
if (idxFile) {
  const idx = readJson(idxFile);
  if (!Array.isArray(idx)) fail(`${idxFile} must be an array`);
  clips = idx.map((c) => {
    const start = typeof c.start === 'number' ? c.start : (lines[c.i - 1]?.start ?? null);   // i is 1-based
    const lead_ = typeof c.lead === 'number' ? c.lead : 0.03;
    const sf = start === null ? null : fr(start);
    const placeAt = start === null ? null : Math.max(0, start - lead_);
    return { i: c.i, text: c.text, clip: c.clip, dur: c.dur, leadSec: lead_, speechStart: start, speechEnd: typeof c.end === 'number' ? c.end : null,
      speechFrame: sf, onsetFrame: sf === null ? null : Math.max(0, sf - lead), clipAtSec: placeAt === null ? null : +placeAt.toFixed(3), clipAtFrame: placeAt === null ? null : fr(placeAt), idxFile };
  });
}
const beats = { fps, lead, estimated: list.some((w) => w.est), durationSec: words[words.length - 1].end, durationFrames: words[words.length - 1].endFrame, words, lines, ...(clips.length ? { clips } : {}) };

if (!opt.quiet) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`fps ${fps}  lead ${lead} frames${beats.estimated ? '  (word times are ESTIMATES)' : ''}`);
  console.log(`${pad('#', 4)}${pad('word', 18)}${pad('start', 7)}${pad('end', 7)}${pad('onset', 7)}  time(s)`);
  for (const w of words) console.log(`${pad(w.i, 4)}${pad(w.word.slice(0, 17), 18)}${pad(w.startFrame, 7)}${pad(w.endFrame, 7)}${pad(w.onsetFrame, 7)}  ${w.start.toFixed(2)}-${w.end.toFixed(2)}`);
  if (lines.length) {
    console.log('\nlines');
    for (const l of lines) console.log(`  [${l.startFrame}-${l.endFrame}] onset ${l.onsetFrame}  ${l.text}`);
  }
  if (clips.length) {
    console.log(`\nclips (${idxFile})  speech f = frame the voice is heard; onset f = speech f - ${lead}; place-at f = where the clip file starts (speech f - clip lead)`);
    console.log(`${pad('line', 5)}${pad('speech f', 10)}${pad('onset f', 9)}${pad('place f', 9)}${pad('dur s', 7)}mix.py arg`);
    for (const c of clips) console.log(`${pad(c.i, 5)}${pad(c.speechFrame ?? '?', 10)}${pad(c.onsetFrame ?? '?', 9)}${pad(c.clipAtFrame ?? '?', 9)}${pad(c.dur ?? '?', 7)}${c.clipAtSec === null ? '' : `--vo ${c.clip}@${c.clipAtSec}`}   ${(c.text || '').slice(0, 36)}`);
    console.log('(to land a line on a different beat frame F: --vo <clip>@(F/fps - lead_s); lead_s is in lines.index.json)');
  }
  console.log(`\ntotal ${beats.durationFrames} frames (${beats.durationSec.toFixed(2)}s)`);
}
const out = path.resolve(opt.out || path.join(path.dirname(pos[0]), 'beats.json'));
fs.writeFileSync(out, JSON.stringify(beats, null, 1) + '\n');
fs.writeFileSync(out.replace(/\.json$/, '') + '.js', `window.BEATS = ${JSON.stringify(beats)};\n`);
console.error(`wrote ${out} and ${out.replace(/\.json$/, '')}.js`);
