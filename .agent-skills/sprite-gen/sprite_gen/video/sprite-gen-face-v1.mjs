// SPDX-License-Identifier: Apache-2.0
// sprite-gen face player v1: the one place the face layer's rules run. A live page (a browser source) and
// `sprite-gen face-bake` (through node) call the same functions, so a baked line and a live one pick the same
// frames. docs/face-parts.md owns the rules; the numbers are the pack's (`face-pack.json` rules).
//
//   mouthTrack(samples, sampleRate, rules, { fps, tags })  voice -> a mouth level per frame
//   pickFaces(pack, levels, set, rest)                     levels -> a talking frame (or the rest) per frame
//   planScene(pack, { play, start, levels, tags })         a body clip and a line -> what each frame shows
//   loadFacePack(url), createFacePlayer(canvas, pack, { audioContext })   the live page

// Python's round(): halves to the even neighbour (the rule was measured with it).
function roundEven(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

// The flap: a mouth opens on every syllable and closes between them. Loudness over 1/48 s windows every 1/96 s,
// lightly smoothed, against the line's loudest; a syllable is a peak over closed_under standing prominence above the
// lower of its neighbouring dips, min_gap_s apart (the louder stays). Each opens open_lo_hi by its loudness (a surprise line's loudest to
// surprise_top) on the frame lead_frames ahead of it, half of it the frame before, two fifths the frame after, closed
// otherwise; no frame moves more than max_step levels, and a level over normal_top is entered from wide_from.
export function mouthTrack(samples, sampleRate, rules, { fps = 24, tags = [] } = {}) {
  const n = samples.length;
  const frames = Math.ceil((n / sampleRate) * fps);
  const hop = Math.floor(sampleRate / 96);
  const raw = [];
  for (let i = 0; i < n - 2 * hop; i += hop) {
    let s = 0;
    for (let k = i; k < i + 2 * hop; k++) s += samples[k] * samples[k];
    raw.push(Math.sqrt(s / (2 * hop) + 1e-12));
  }
  const env = raw.map((_, i) => ((raw[i - 1] ?? 0) + raw[i] + (raw[i + 1] ?? 0)) / 3);
  const peak = env.reduce((a, b) => Math.max(a, b), 0);
  for (let i = 0; i < env.length; i++) env[i] = peak > 0 ? env[i] / peak : 0;
  const cand = [];
  for (let i = 1; i < env.length - 1; i++) {
    if (env[i] >= env[i - 1] && env[i] > env[i + 1] && env[i] > rules.closed_under) {
      const lo = Math.max(0, i - 10), hi = Math.min(env.length, i + 11);
      let left = Infinity, right = Infinity;
      for (let k = lo; k < i; k++) left = Math.min(left, env[k]);
      for (let k = i + 1; k < hi; k++) right = Math.min(right, env[k]);
      if (env[i] - Math.max(left, right) > rules.prominence) cand.push(i);
    }
  }
  const syl = [];
  for (const i of cand) {
    if (syl.length && (i - syl[syl.length - 1]) / 96 < rules.min_gap_s) {
      if (env[i] > env[syl[syl.length - 1]]) syl[syl.length - 1] = i;
    } else syl.push(i);
  }
  const surprise = tags.some((t) => rules.surprise_tags.includes(t));
  const top = surprise ? rules.surprise_top : rules.normal_top;
  const louds = syl.map((i) => env[i]);
  const [loL, hiL] = louds.length ? [Math.min(...louds), Math.max(...louds)] : [0, 1];
  const [openLo, openHi] = rules.open_lo_hi;
  const levels = new Array(frames).fill(0);
  const peaks = [];
  syl.forEach((i, k) => {
    const f = roundEven((i / 96) * fps) - rules.lead_frames;
    if (f < 0 || f >= frames) return;
    const l = louds[k];
    const size = surprise && l >= rules.surprise_at ? top
      : Math.trunc(roundEven(openLo + ((l - loL) / Math.max(hiL - loL, 1e-6)) * (openHi - openLo)));
    peaks.push({ frame: f, size });
    levels[f] = Math.max(levels[f], size);
    if (f > 0) levels[f - 1] = Math.max(levels[f - 1], Math.ceil(size * 0.5));
    if (f + 1 < frames) levels[f + 1] = Math.max(levels[f + 1], Math.trunc(size * 0.4));
  });
  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (let i = 1; i < frames; i++) {
      if (levels[i] - levels[i - 1] > rules.max_step) { levels[i - 1] = levels[i] - rules.max_step; changed = true; }
      if (levels[i - 1] - levels[i] > rules.max_step) { levels[i] = levels[i - 1] - rules.max_step; changed = true; }
      if (levels[i] > rules.normal_top && levels[i - 1] < rules.wide_from) { levels[i - 1] = rules.wide_from; changed = true; }
    }
    if (!changed) break;
  }
  return { levels, syllables: syl.map((i) => ({ t_s: i / 96, loud: env[i] })), peaks };
}

// The talking frames of one expression set, picked to a line's mouth levels: Viterbi over (frame of the set | the
// rest) per output frame, starting and ending on the rest. A frame's next is the clip's next; a hold, a jump to a
// frame within the jump line of the clip's next, an entry from the rest and an exit to it (both within the enter
// line: the clip's own largest step) cost the pack's numbers. A frame costs how far its open area is from the
// level's (a mouth opened less than wanted under_weight times more), in one level's area; the rest costs the area
// wanted.
export function pickFaces(pack, levels, set, rest) {
  const rules = pack.rules;
  const D = pack.face.steps;
  const n = D.length;
  const frames = pack.face.sets[set].frames;
  const member = new Set(frames);
  const area = pack.face.frames.map((f) => f.open_px);
  const want = levels.map((l) => rules.open_px[Math.min(l, rules.open_px.length - 1)]);
  const unit = rules.open_px[1];
  const S = frames.length;
  const REST = S;
  const pos = new Map(frames.map((j, k) => [j, k]));
  const enter = frames.map((j) => D[rest][j] <= rules.enter_line);
  const leave = frames.map((j) => D[j][rest] <= rules.enter_line);
  let cost = new Array(S + 1).fill(Infinity);
  cost[REST] = 0;
  const back = [];
  for (let t = 0; t < want.length; t++) {
    const next = new Array(S + 1).fill(Infinity);
    const arg = new Array(S + 1).fill(-1);
    for (let k = 0; k < S; k++) {
      const j = frames[k];
      let best = Infinity, how = -1;
      if (j > 0 && member.has(j - 1) && cost[pos.get(j - 1)] < best) { best = cost[pos.get(j - 1)]; how = pos.get(j - 1); }
      if (cost[k] + rules.hold_cost < best) { best = cost[k] + rules.hold_cost; how = k; }
      if (enter[k] && cost[REST] + rules.edge_cost < best) { best = cost[REST] + rules.edge_cost; how = REST; }
      let jb = Infinity, ji = -1;
      for (let q = 0; q < S; q++) {
        const after = Math.min(frames[q] + 1, n - 1);
        if (D[after][j] <= rules.jump_line) {
          const c = cost[q] + rules.jump_cost + D[after][j];
          if (c < jb) { jb = c; ji = q; }
        }
      }
      if (ji >= 0 && jb < best) { best = jb; how = ji; }
      const d = area[j] - want[t];
      next[k] = best + (d < 0 ? -d * rules.under_weight : d) / unit;
      arg[k] = how;
    }
    let lb = Infinity, li = -1;
    for (let k = 0; k < S; k++) if (leave[k] && cost[k] + rules.edge_cost < lb) { lb = cost[k] + rules.edge_cost; li = k; }
    if (cost[REST] <= lb) { next[REST] = cost[REST] + want[t] / unit; arg[REST] = REST; }
    else { next[REST] = lb + want[t] / unit; arg[REST] = li; }
    cost = next;
    back.push(arg);
  }
  const path = [REST];
  for (let t = want.length - 1; t > 0; t--) path.push(back[t][path[path.length - 1]]);
  path.reverse();
  return { path: path.map((k) => (k === REST ? null : frames[k])), cost: cost[REST], want };
}

function body(pack, name) {
  const b = pack.body.find((x) => x.name === name);
  if (!b) throw new RangeError(`face pack has no body clip ${name}`);
  return b;
}

function loopBody(pack) {
  return pack.body.find((x) => x.loop);
}


function mod(a, n) {
  return ((a % n) + n) % n;
}

// What every frame shows for a body clip played from its start (`play`), or the loop from a cell (`start`), with a
// line said at once (its mouth `levels`, one a frame). The line waits for the end of the clip's own_mouth span (its
// own mouth and sound play till then, the layer off), and then for the first frame whose switch to the rest the body
// names there (`entry`) is within the jump line: a voice never plays on a frame whose mouth cannot move. A layer
// already on (`layer`) goes on in its own set and rest at once. A clip that plays once goes on to the loop from its
// first cell; a line with no frame to come on at within the clip and one round of the loop is refused.
export function planScene(pack, { play = null, start = 0, levels = [], layer = null } = {}) {
  const loop = loopBody(pack);
  const first = play ? body(pack, play) : loop;
  const own = play && first.own_mouth ? first.own_mouth.end_frame : 0;
  const cellAt = (t) => {
    if (!play) return { body: loop.name, cell: mod(start + t, loop.cells.length) };
    if (t < first.cells.length) return { body: first.name, cell: t };
    return { body: loop.name, cell: mod(t - first.cells.length, loop.cells.length) };
  };
  const frames = [];
  if (!levels.length) {
    for (let t = 0; t < first.cells.length; t++) frames.push({ ...cellAt(t), face: null, layer: "off", level: 0 });
    return { frames, set: null, rest: null, own_mouth: own, line_start: null, wait: null };
  }
  const { set, rest } = layer ?? body(pack, cellAt(own).body).entry;
  let lineStart = own;
  if (!layer) {
    const limit = (play ? first.cells.length : 0) + loop.cells.length;
    while (lineStart < limit) {
      const c = cellAt(lineStart);
      if (body(pack, c.body).switch[String(rest)][c.cell] <= pack.rules.jump_line) break;
      lineStart++;
    }
    if (lineStart >= limit) throw new RangeError(`the face layer has no frame within the jump line of its rest ${rest} to come on`);
  }
  const pick = pickFaces(pack, levels, set, rest);
  for (let t = 0; t < lineStart + levels.length; t++) {
    const c = cellAt(t);
    if (t < lineStart) { frames.push({ ...c, face: null, layer: "off", level: 0 }); continue; }
    const j = pick.path[t - lineStart];
    frames.push({ ...c, face: j ?? rest, layer: j === null ? "rest" : "talk", level: levels[t - lineStart] });
  }
  return { frames, set, rest, own_mouth: own, line_start: lineStart, wait: lineStart - own, want: pick.want, cost: pick.cost };
}

// --- the live page --------------------------------------------------------------------------------------------------

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`face pack picture did not load: ${url}`));
    im.src = url;
  });
}

// The pack and its pictures: the face and keep pictures loaded whole, a body cell when it is first drawn.
export async function loadFacePack(url) {
  const at = (p) => new URL(p, new URL(url, globalThis.location?.href)).href;
  const pack = await (await fetch(url)).json();
  if (pack.kind !== "sprite-gen-face-pack" || pack.version !== 1) throw new RangeError("not a sprite-gen-face-pack version 1");
  pack.url = at;
  pack.images = { face: {}, keep: {} };
  await Promise.all(pack.face.frames.filter((f) => f.file).map(async (f) => { pack.images.face[f.index] = await loadImage(at(f.file)); }));
  await Promise.all(pack.body.map(async (b) => {
    pack.images.keep[b.name] = await Promise.all(b.keep.map((k) => (k ? loadImage(at(k.file)) : null)));
  }));
  return pack;
}

function mono(buffer) {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

function chain(m1, m2) {
  // m1 . m2 for affine maps given as six numbers [a b c; d e f]
  const [a, b, c, d, e, f] = m1, [g, h, i, j, k, l] = m2;
  return [a * g + b * j, a * h + b * k, a * i + b * l + c, d * g + e * j, d * h + e * k, d * i + e * l + f];
}

function canvasTransform(m, k) {
  // a map on pixel indices (centres on integers) as a canvas transform (centres at +0.5), scaled by k
  const [a, b, c, d, e, f] = m;
  return [k * a, k * d, k * b, k * e, k * (c + 0.5 - (a + b) * 0.5), k * (f + 0.5 - (d + e) * 0.5)];
}

// The live player: the loop runs on one frame clock (the audio context's), a body clip plays from its start when
// asked (`play`), a line talks the face layer (`say`). Requests run one after another, in the order they are made.
// After a line the layer stays at its rest until a loop frame within the jump line of it, then goes off.
export function createFacePlayer(canvas, pack, { audioContext } = {}) {
  const ctx = canvas.getContext("2d");
  const audio = audioContext ?? new AudioContext();
  const fps = pack.fps;
  const loop = loopBody(pack);
  const cells = new Map();
  let origin = 0;
  let loopPhase = 0;
  let scene = null;
  let resting = null;
  let queue = Promise.resolve();
  let clip = null;
  let running = false;
  let shown = -1;

  const now = () => Math.floor((audio.currentTime - origin) * fps);
  const cell = (name, k) => {
    const key = `${name}/${k}`;
    if (!cells.has(key)) {
      const im = new Image();
      im.src = pack.url(body(pack, name).cells[k]);
      cells.set(key, im);
    }
    return cells.get(key);
  };

  function draw(f) {
    const k = canvas.width / pack.size[0];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const im = cell(f.body, f.cell);
    if (im.complete) ctx.drawImage(im, 0, 0, canvas.width, canvas.height);
    if (f.face === null || f.face === undefined) return;
    const b = body(pack, f.body);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.setTransform(...canvasTransform(chain(b.to_body[f.cell], pack.face.frames[f.face].to_ref), k));
    ctx.drawImage(pack.images.face[f.face], 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const keep = b.keep[f.cell];
    const kim = pack.images.keep[f.body][f.cell];
    if (keep) ctx.drawImage(kim, keep.at[0] * k, keep.at[1] * k, kim.width * k, kim.height * k);
  }

  function finish(s) {
    const end = s.plan.frames[s.plan.frames.length - 1];
    const after = s.t0 + s.plan.frames.length;
    loopPhase = end.body === loop.name ? after - (end.cell + 1) : after;
    resting = end.face !== null && s.plan.set ? { set: s.plan.set, rest: s.plan.rest } : null;
    scene = null;
    s.resolve();
  }

  function frameAt(t) {
    if (scene && t - scene.t0 >= scene.plan.frames.length) finish(scene);
    if (scene && t >= scene.t0) return scene.plan.frames[t - scene.t0];
    const c = { body: loop.name, cell: mod(t - loopPhase, loop.cells.length) };
    if (resting && body(pack, c.body).switch[String(resting.rest)][c.cell] <= pack.rules.jump_line) resting = null;
    return { ...c, face: resting ? resting.rest : null };
  }

  function tick() {
    if (!running) return;
    const t = now();
    if (t !== shown) { shown = t; draw(frameAt(t)); }
    requestAnimationFrame(tick);
  }

  function sound(buffer, t, seconds) {
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.connect(audio.destination);
    src.start(origin + t / fps, 0, seconds);
  }

  // One queue for every request, in the order they are made: a request's sound decodes at once (`ready`), and the
  // request starts the frame after the one before it has ended. A line right behind a clip with its own mouth (`after`:
  // that clip's scene once it starts, null if it failed) is planned with the clip instead when it is ready before the
  // span ends, and the clip ends with it. Nothing is capped or dropped: a request that fails rejects, the next goes on.
  function run(ready, make, after = null) {
    const before = queue;
    let open;
    const started = new Promise((resolve) => { open = resolve; });
    const turn = () => before.then(() => ready).then((r) => new Promise((resolve) => {
      const t0 = now() + 1;
      scene = { ...make(t0, r), t0, resolve };
      open(scene);
    }));
    ready.catch(() => {});
    const job = after
      ? after.then((s) => s && ready.then((r) => join(s, r), () => null)).then((joined) => (joined ? joined.ended : turn()))
      : turn();
    job.catch(() => open(null));
    queue = Promise.all([before, job.catch(() => {})]);
    return { job, started };
  }

  // A line said while the clip before it still talks with its own mouth: the clip's plan again, with the line after
  // that span. Null once the span is over; the line then waits for the clip to end.
  function join(s, [data, levels]) {
    if (scene !== s || now() >= s.t0 + body(pack, s.play).own_mouth.end_frame) return null;
    s.plan = planScene(pack, { play: s.play, levels });
    sound(data, s.t0 + s.plan.line_start);
    return { ended: new Promise((resolve) => { const done = s.resolve; s.resolve = () => { done(); resolve(); }; }) };
  }

  async function decode(voice) {
    if (voice instanceof AudioBuffer) return voice;
    const bytes = typeof voice === "string" ? await (await fetch(voice)).arrayBuffer() : voice;
    return audio.decodeAudioData(bytes);
  }

  return {
    start() { origin = audio.currentTime; loopPhase = 0; running = true; requestAnimationFrame(tick); },
    stop() { running = false; },
    // A body clip from its start, with its own sound; the line asked for right after it waits for its own mouth.
    async play(name) {
      const b = body(pack, name);
      const { job, started } = run(b.sound ? decode(pack.url(b.sound)) : Promise.resolve(null), (t0, own) => {
        resting = null;
        if (own) sound(own, t0, (b.own_mouth ? b.own_mouth.end_frame : b.cells.length) / fps);
        return { plan: planScene(pack, { play: name }), play: name };
      });
      clip = b.own_mouth ? started : null;
      return job;
    },
    // A line: the voice plays and the face layer talks to it.
    async say(voice, { tags = [] } = {}) {
      const ready = decode(voice).then((data) => [data, mouthTrack(mono(data), data.sampleRate, pack.rules, { fps, tags }).levels]);
      const after = clip;
      clip = null;
      return run(ready, (t0, [data, levels]) => {
        const plan = planScene(pack, { start: mod(t0 - loopPhase, loop.cells.length), levels, layer: resting });
        sound(data, t0 + plan.line_start);
        return { plan };
      }, after).job;
    },
  };
}
