"""Measure a video's dynamism, and gate a render section by section against its energy's targets.
usage:
  python tools/dynamism_check.py gate <video> [--start S] [--variant b] [--only id,id] [--span id=a:b[:energy]]...
                                [--targets FILE] [--json FILE] [--sheets DIR] [--force]
  python tools/dynamism_check.py measure <video> [--span name=a:b[:energy]]... [--crop W:H:X:Y]
                                [--write-targets FILE] [--json FILE] [--sheets DIR] [--force]
gate runs from the project root. Sections are the lowest-z TIMELINE entries of engine/timeline.js (read with node) on
the video's canvas, or --span. Energy is each entry's `energy`, else the song's loudness in engine/data/audio.json.
gate takes and reports song times (--start = the song time of the video's first frame); measure uses video times.
Flashes (WCAG general flashes: opposing changes of 10% relative luminance, darker side under 0.80) are gated over the
whole video. Exit 0: pass, 1: a gate failed, 2: bad input. measure never fails a video. See references/dynamism.md."""
import argparse, json, os, shutil, subprocess, sys
import numpy as np

CLOCK = 60            # every input is resampled to 60 fps, so cadence repeats (24 fps footage in a 60 fps render) count
LONG = 320            # analysis size: long side in px
REF_LONG = 1920       # motion is reported in px per 1/60 s on a 1920 px long side, whatever the input size
DIFF = 24             # a pixel changed (cuts, busiest seconds): gray difference over 24 of 255
STILL_DIFF = 12       # the still test's finer threshold: a slow move over soft detail still breaks a run
STILL_AREA = 0.015    # a frame continues a still run while under 1.5% of it differs from the previous frame and
STILL_FLOW = 1.0      # from the run's first frame, and its flow moves under 1 px at the analysis size...
STILL_DRIFT = 0.25    # ...and under 0.25 px from the run's first frame: per-pair flow alone read a calm-floor drift
                      # as still. At 0.4, 24 or 25 fps footage of it read still: a still run spans 2 new pictures,
                      # 0.4 px. At 0.2, grain of sigma 3.4 on a hold, at CRF 23, read only 70 to 83% still
STILL_RUN = 6         # a frame is still when its run lasts longer than 6 frames (0.1 s): 10 fps footage still plays
REPEAT_MAX = 2        # a pair whose largest difference is this small is a repeated frame: no flow call, no motion
FLOW_OK = 0.8         # flow explains a pair when the warped frame correlates this well with the previous one
FLOW_CAP = 24         # px at LONG: the flow range; a change the flow cannot explain reads at least this, scaled by area
CUT_AREA = 0.45       # a cut: neither the flow nor a global shift explains the change, and most of the frame
CUT_NCC = 0.5         # changes or the two frames barely correlate (a flash, a color swap, another shot)
CUT_MERGE = 3         # frames: cut frames this close are one cut (a flash of up to 3 frames)
CUT_RETURN = 9        # frames: a cut back, within 0.15 s, to the shot before the previous cut closes that cut (a
                      # longer flash, an insert); a 4-frame white flash at 60 fps read as two cuts
WINDOW, HOP = 30, 6   # motion is a 0.5 s window mean (whole 24, 25 and 30 fps cycles), stepped every 0.1 s
FLASH_DELTA = 0.10    # WCAG: a change of 10% of the maximum relative luminance...
FLASH_DARK = 0.80     # ...where the darker state is below 0.80
FLASH_MAX = 3         # flashes (pairs of opposing changes) in any 1 s window, everywhere, end card included
HOLD_LIST_MIN = 0.3   # holds at least this long are listed with bar and beat
MIN_JUDGED_S = 1.0    # a section with less of it in the video is reported, not judged
ENERGY_RATIO = (0.8, 1.15)  # section mean of env.mix over the song mean: under 0.8 calm, 1.15 or more high
OVERLAY_END = 9999    # an entry ending this late is a whole-song overlay (the HUD), never a section
ENERGIES = ('calm', 'mid', 'high', 'showcase')
TARGET_KEYS = ('still_max', 'hold_max_s', 'motion_min')
# Authoring-time starting points, calibrated on synthetic fixtures only (references/dynamism.md section 3).
DEFAULT_TARGETS = {
    'calm': {'still_max': 0.50, 'hold_max_s': 1.0, 'motion_min': 0.5},
    'mid': {'still_max': 0.30, 'hold_max_s': 1.0, 'motion_min': 1.0},
    'high': {'still_max': 0.15, 'hold_max_s': 0.5, 'motion_min': 2.0},
}
MARGINS = 'still + 0.10, hold x 1.25 (at least 0.3 s), motion x 0.7'
TIMELINE_JS = r"""
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const file = process.argv[1];
let m;
try {
  m = await import('data:text/javascript;base64,' + fs.readFileSync(file).toString('base64'));
} catch (e) {
  m = await import(pathToFileURL(file).href); // relative imports need a file URL
}
// JSON has no Infinity: a non-finite number becomes +-1e9, so `end: Infinity` reads as an overlay
const finite = (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? (v > 0 ? 1e9 : -1e9) : v);
process.stdout.write(JSON.stringify({ CANVAS: m.CANVAS ?? null, TIMELINE: m.TIMELINE ?? null }, finite));
"""
_LUT = np.array([c / 255 / 12.92 if c <= 10 else ((c / 255 + 0.055) / 1.055) ** 2.4 for c in range(256)], np.float32)
_REC709 = np.float32([0.2126, 0.7152, 0.0722])


class BadInput(Exception):
    pass


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(obj, path, **kw):
    try:
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        with open(path, 'w') as f:
            json.dump(obj, f, **kw)
    except OSError as e:
        raise BadInput(f'{path}: {e.strerror or e}')


def probe(video):
    """The decoded frame size, from one PPM header: ffmpeg applies a phone clip's rotation tag, ffprobe does not."""
    if not os.path.isfile(video):
        raise BadInput(f'{video}: no such file')
    p = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-i', video, '-frames:v', '1', '-f', 'image2pipe',
                          '-c:v', 'ppm', '-'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    try:
        head = p.stdout.read(64).split()
    finally:
        p.kill()
        p.wait()
        p.stdout.close()
    if len(head) < 3 or head[0] != b'P6':
        raise BadInput(f'{video}: no video frames')
    return int(head[1]), int(head[2])


def analysis_size(w, h):
    if w >= h:
        return LONG, max(2, round(LONG * h / w / 2) * 2)
    return max(2, round(LONG * w / h / 2) * 2), LONG


def frames(video, w, h, crop=None):
    """Yield (gray, mean relative luminance) per 1/60 s at the analysis size."""
    import cv2
    vf = (f'crop={crop},' if crop else '') + f'scale={w}:{h}:flags=area,fps={CLOCK}'
    p = subprocess.Popen(['ffmpeg', '-nostdin', '-v', 'error', '-i', video, '-vf', vf, '-f', 'rawvideo',
                          '-pix_fmt', 'rgb24', '-'], stdout=subprocess.PIPE)
    n = w * h * 3
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n:
                break
            rgb = np.frombuffer(b, np.uint8).reshape(h, w, 3)
            yield cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), float(_LUT[rgb].mean(axis=(0, 1)) @ _REC709)
    finally:
        p.kill()
        p.wait()
        p.stdout.close()


def _ncc(x, y):
    x = x.astype(np.float32) - x.mean()
    y = y.astype(np.float32) - y.mean()
    d = float(np.sqrt((x * x).sum() * (y * y).sum()))
    return float((x * y).sum()) / d if d > 1e-6 else 0.0


class PairMotion:
    """Motion between two consecutive distinct frames, in px at the analysis size, and whether the pair is a cut."""

    def __init__(self, w, h):
        import cv2
        self.cv2, self.w, self.h = cv2, w, h
        self.gx, self.gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
        self.small = (max(8, w // 8), max(8, h // 8))
        self.win = cv2.createHanningWindow((w, h), cv2.CV_32F)

    def __call__(self, a, b, area):
        cv2 = self.cv2
        # Farneback's pyramid stops at 32 rows, which caps it near 16 px here: a 1/8 pass seeds it, so fast moves read
        sa, sb = (cv2.resize(x, self.small, interpolation=cv2.INTER_AREA) for x in (a, b))
        seed = cv2.calcOpticalFlowFarneback(sa, sb, None, 0.5, 1, 9, 3, 5, 1.1, 0)
        seed = cv2.resize(seed, (self.w, self.h)) * (self.w / self.small[0])
        fl = cv2.calcOpticalFlowFarneback(a, b, seed, 0.5, 3, 15, 3, 5, 1.2, cv2.OPTFLOW_USE_INITIAL_FLOW)
        m = (cv2.absdiff(a, b) > 10) | (cv2.Laplacian(b, cv2.CV_16S) != 0)
        if not m.any():
            return 0.0, False
        v = float(np.hypot(fl[..., 0], fl[..., 1])[m].mean())
        warped = cv2.remap(b, self.gx + fl[..., 0], self.gy + fl[..., 1], cv2.INTER_LINEAR,
                           borderMode=cv2.BORDER_REPLICATE)
        if _ncc(a[m], warped[m]) >= FLOW_OK:
            return v, False
        # beyond the flow's range: a whip pan is still one global shift
        (dx, dy), _ = cv2.phaseCorrelate(a.astype(np.float32), b.astype(np.float32), self.win)
        sx, sy = int(round(dx)), int(round(dy))
        x0, x1, y0, y1 = max(0, -sx), self.w - max(0, sx), max(0, -sy), self.h - max(0, sy)
        if (x1 - x0) * (y1 - y0) >= 0.25 * self.w * self.h:
            if _ncc(a[y0:y1, x0:x1], b[y0 + sy:y1 + sy, x0 + sx:x1 + sx]) >= FLOW_OK:
                return max(v, float(np.hypot(dx, dy))), False
        if area > CUT_AREA or _ncc(a, b) < CUT_NCC:
            return 0.0, True
        return max(v, area * FLOW_CAP), False


def measure(video, crop=None, workers=None):
    """Per-frame series on the 60 fps clock. Interval i is the step from frame i-1 to frame i."""
    import cv2
    from collections import deque
    from concurrent.futures import ThreadPoolExecutor
    w, h = probe(video)
    if crop:
        w, h = (int(v) for v in crop.split(':')[:2])
    aw, ah = analysis_size(w, h)
    pair = PairMotion(aw, ah)

    def compare(prev, g):
        d = cv2.absdiff(g, prev)
        a1 = float((d > DIFF).mean())
        moved = float((d > STILL_DIFF).mean()) >= STILL_AREA
        if int(d.max()) <= REPEAT_MAX:
            return a1, moved, 0.0, False
        v, c = pair(prev, g, a1)
        return a1, moved, v, c

    lum, gray, area, motion, runs, onsets = [], [], [0.0], [np.nan], [], []
    state = {'s': 0, 'anchor': None, 'acc': 0.0, 'cut': -99, 'open': None}

    def continues_run(g, v):
        d = cv2.absdiff(g, state['anchor'])
        if float((d > STILL_DIFF).mean()) >= STILL_AREA:
            return False
        # The summed steps bound the drift from the anchor: the flow call waits until they reach half the limit.
        state['acc'] += v
        if state['acc'] < STILL_DRIFT / 2:
            return True
        drift, c = pair(state['anchor'], g, float((d > DIFF).mean())) if int(d.max()) > REPEAT_MAX else (0.0, False)
        state['acc'] = drift
        return not c and drift < STILL_DRIFT

    def on_cut(i, before, g):
        last, state['cut'] = state['cut'], i
        if i - last <= CUT_MERGE:
            return
        o = state['open']
        if o and i - o[0] <= CUT_RETURN and not pair(o[1], g, float((cv2.absdiff(o[1], g) > DIFF).mean()))[1]:
            state['open'] = None  # back on the shot before the flash
            return
        onsets.append(i)
        state['open'] = (i, before)

    def consume(pending):
        i, before, g, job = pending.popleft()
        a1, moved, v, c = job.result()
        area.append(a1)
        motion.append(np.nan if c else v * REF_LONG / LONG)
        if c:
            on_cut(i, before, g)
        if c or moved or v >= STILL_FLOW or not continues_run(g, v):
            runs.append((state['s'], i))
            state.update(s=i, anchor=g, acc=0.0)

    workers = workers or min(4, os.cpu_count() or 1)
    threads = cv2.getNumThreads()
    cv2.setNumThreads(1)  # the pool parallelizes across frame pairs instead
    pending, prev = deque(), None
    try:
        with ThreadPoolExecutor(workers) as pool:
            for i, (g, l) in enumerate(frames(video, aw, ah, crop)):
                lum.append(l)
                gray.append(float(g.mean()))
                if prev is None:
                    state['anchor'] = g
                else:
                    pending.append((i, prev, g, pool.submit(compare, prev, g)))
                    if len(pending) > 4 * workers:
                        consume(pending)
                prev = g
            while pending:
                consume(pending)
    finally:
        cv2.setNumThreads(threads)
    s = state['s']
    n = len(lum)
    if n < 2:
        raise BadInput(f'{video}: no frames decoded')
    runs.append((s, n))
    still = np.zeros(n, bool)
    for a, b in runs:
        if b - a > STILL_RUN:
            still[a:b] = True
    return dict(n=n, size=[w, h], lum=np.array(lum), gray=np.array(gray), area=np.array(area),
                motion=np.array(motion), still=still, runs=[r for r in runs if r[1] - r[0] > STILL_RUN], cuts=onsets)


def flash_transitions(lum):
    """Opposing swings of mean relative luminance by FLASH_DELTA or more, darker side under FLASH_DARK.
    Returns [[frame, direction, amplitude]]. A flash is a pair of them."""
    out, trend = [], 0
    hi = lo = start = float(lum[0])
    for i, v in enumerate(float(x) for x in lum):
        if trend >= 0:
            hi = max(hi, v)
        if trend <= 0:
            lo = min(lo, v)
        if trend <= 0 and v - lo >= FLASH_DELTA and lo < FLASH_DARK:
            if out:
                out[-1][2] = start - lo
            out.append([i, 1, 0.0]); start, trend, hi = lo, 1, v
        elif trend >= 0 and hi - v >= FLASH_DELTA and v < FLASH_DARK:
            if out:
                out[-1][2] = hi - start
            out.append([i, -1, 0.0]); start, trend, lo = hi, -1, v
    if out:
        out[-1][2] = abs((hi if trend == 1 else lo) - start)
    return out


def max_in_window(times, width=1.0):
    """Most events in any half-open window [t, t + width). Returns (count, window start)."""
    times = sorted(times)
    best, at, a = 0, None, 0
    for b, t in enumerate(times):
        while t - times[a] >= width - 1e-9:
            a += 1
        if b - a + 1 > best:
            best, at = b - a + 1, times[a]
    return best, at


def max_flashes(transitions):
    """Most flashes in any 1 s window, a flash being a pair of opposing changes. Returns (flashes, window start)."""
    count, at = max_in_window([f / CLOCK for f, _, _ in transitions])
    return count / 2, at


def bar_beat(t, audio):
    if not audio or not audio.get('downbeats') or not audio.get('beats'):
        return None, None
    t += 1e-3
    db = [x for x in audio['downbeats'] if x <= t]
    if not db:
        return 0, None
    return len(db), sum(1 for x in audio['beats'] if db[-1] - 1e-3 <= x <= t)


def env_rate(audio):
    mix = audio['env']['mix']
    return len(mix) / audio['duration']  # not env_fps: the analysis hop makes it about 60.08 frames per second


def energy_of(sec, audio):
    if sec.get('energy'):
        return sec['energy'], 'timeline' if sec.get('from') == 'timeline' else 'span'
    if not audio:
        return 'mid', 'default'
    if sec['start'] >= audio['duration'] - 1e-6:
        return 'showcase', 'audio'  # after the song: the silent extended end card
    mix = np.asarray(audio.get('env', {}).get('mix') or [], float)
    if not len(mix):
        return 'mid', 'default'
    r = env_rate(audio)
    seg = mix[int(sec['start'] * r):max(int(sec['start'] * r) + 1, int(min(sec['end'], audio['duration']) * r))]
    ratio = float(seg.mean()) / max(float(mix.mean()), 1e-9) if len(seg) else 1.0
    return ('calm' if ratio < ENERGY_RATIO[0] else 'high' if ratio >= ENERGY_RATIO[1] else 'mid'), 'audio'


def canvas_tags(entry):
    if entry.get('canvas') is None:
        return None
    raw = entry['canvas'] if isinstance(entry['canvas'], list) else [entry['canvas']]
    tags = [str(t).strip().lower() for t in raw]
    if any(t not in ('landscape', 'portrait', 'square') for t in tags):
        raise BadInput(f"timeline entry {entry.get('id')}: canvas {json.dumps(entry['canvas'])} must be landscape, "
                       'portrait or square')
    return tags


def orientation(w, h):
    return 'square' if w == h else 'portrait' if h > w else 'landscape'


def sections_from_timeline(timeline, orient, variant='a', only=None):
    """The section at each instant is the lowest-z entry the engine draws there (z defaults to 0, the first listed
    wins a tie), filtered as main.js filters: --only skips the variant filter, the canvas filter always applies."""
    keep = []
    for e in timeline:
        try:
            float(e['start']), float(e['end'])
        except (TypeError, KeyError, ValueError):
            raise BadInput(f'timeline entry {json.dumps(e)}: needs an id and numeric start and end')
        if 'id' not in e:
            raise BadInput(f'timeline entry {json.dumps(e)}: needs an id')
        if only is not None and e['id'] not in only:
            continue
        tags = canvas_tags(e)
        if tags is not None and orient not in tags:
            continue
        if only is None and e.get('variant') and e['variant'] != variant:
            continue
        if e['id'] == 'hud' or float(e['end']) >= OVERLAY_END:
            continue
        if e.get('energy') is not None and e['energy'] not in ENERGIES:
            raise BadInput(f"timeline entry {e['id']}: energy {json.dumps(e['energy'])} must be one of "
                           + ', '.join(ENERGIES))
        keep.append(e)
    edges = sorted({float(e['start']) for e in keep} | {float(e['end']) for e in keep})
    pieces = []
    for a, b in zip(edges, edges[1:]):
        on = [e for e in keep if float(e['start']) <= a < float(e['end'])]
        if not on:
            continue
        top = min(on, key=lambda e: 0 if e.get('z') is None else e['z'])
        if pieces and pieces[-1][0] is top and pieces[-1][2] == a:
            pieces[-1][2] = b
        else:
            pieces.append([top, a, b])
    return [{'id': e['id'], 'start': a, 'end': b, 'energy': e.get('energy'), 'from': 'timeline'} for e, a, b in pieces]


def load_timeline(path='engine/timeline.js'):
    if not os.path.isfile(path):
        raise BadInput(f'no sections: {path} not found (run from the project root, or pass --span id=a:b[:energy])')
    if not shutil.which('node'):
        raise BadInput(f'reading {path} needs node; or pass --span id=a:b[:energy]')
    r = subprocess.run(['node', '--input-type=module', '-e', TIMELINE_JS, path], capture_output=True, text=True)
    if r.returncode != 0:
        raise BadInput(f'{path}: node could not load it:\n{r.stderr.strip()}')
    try:
        tl = json.loads(r.stdout.strip().splitlines()[-1]).get('TIMELINE')  # the last line: a console.log may precede it
    except (IndexError, ValueError):
        raise BadInput(f'{path}: node printed no TIMELINE')
    if not isinstance(tl, list):
        raise BadInput(f'{path}: no TIMELINE array exported')
    return tl


def parse_spans(specs, names_free):
    out = []
    for spec in specs or []:
        try:
            name, rng = spec.split('=', 1)
            parts = rng.split(':')
            if not name or len(parts) not in (2, 3):
                raise ValueError
            a, b = float(parts[0]), float(parts[1])
            energy = parts[2] if len(parts) > 2 else None
            if b <= a:
                raise ValueError
        except ValueError:
            raise BadInput(f'--span {spec}: expected name=start:end[:energy] with end > start')
        if energy is None and names_free and name in ENERGIES:
            energy = name
        if energy is not None and energy not in ENERGIES:
            raise BadInput(f'--span {spec}: energy must be one of ' + ', '.join(ENERGIES))
        out.append({'id': name, 'start': a, 'end': b, 'energy': energy, 'from': 'span'})
    return out


def load_targets(path):
    """Defaults, replaced key by key by the file. Keys: calm, mid, high (each still_max, hold_max_s, motion_min), from."""
    targets = {k: dict(v) for k, v in DEFAULT_TARGETS.items()}
    if not path:
        return targets, 'defaults'
    try:
        data = load_json(path)
    except (OSError, ValueError) as e:
        raise BadInput(f'{path}: {e}')
    if not isinstance(data, dict):
        raise BadInput(f'{path}: expected an object keyed by energy')
    for energy, vals in data.items():
        if energy == 'from':
            continue
        if energy not in DEFAULT_TARGETS or not isinstance(vals, dict):
            raise BadInput(f'{path}: unknown key {json.dumps(energy)} (calm, mid, high or from)')
        for k, v in vals.items():
            if k not in TARGET_KEYS or not isinstance(v, (int, float)) or isinstance(v, bool):
                raise BadInput(f'{path}: {energy}.{k}: expected a number for one of ' + ', '.join(TARGET_KEYS))
            targets[energy][k] = float(v)
    return targets, path


def frame_range(m, a, b, t0):
    """Frames of the series inside song time [a, b) for a video starting at song time t0."""
    return max(0, int(round((a - t0) * CLOCK))), min(m['n'], int(round((b - t0) * CLOCK)))


def window_motion(m, fa, fb):
    v = m['motion'][fa + 1:fb] if fb - fa > 1 else np.array([])
    if not len(v) or np.all(np.isnan(v)):
        return 0.0
    if len(v) <= WINDOW:
        return float(np.nanmean(v))
    vals = [np.nanmean(v[i:i + WINDOW]) for i in range(0, len(v) - WINDOW + 1, HOP)
            if not np.all(np.isnan(v[i:i + WINDOW]))]
    return float(np.median(vals)) if vals else 0.0


def summarize(m, fa, fb, t0, audio):
    """Metrics over frames [fa, fb); times in t0-based seconds."""
    holds = []
    for a, b in m['runs']:
        a, b = max(a, fa), min(b, fb)
        if b - a > STILL_RUN:
            holds.append((a, b))
    seconds = (fb - fa) / CLOCK
    cuts = [i for i in m['cuts'] if fa <= i < fb]
    bar = float(np.median(np.diff(audio['downbeats']))) if audio and len(audio.get('downbeats') or []) > 1 else None
    out = {
        'still_share': round(float(m['still'][fa:fb].mean()), 3) if fb > fa else 0.0,
        'longest_hold_s': round(max([(b - a) / CLOCK for a, b in holds], default=0.0), 3),
        'median_motion': round(window_motion(m, fa, fb), 2),
        'cuts': len(cuts),
        'cuts_per_10s': round(len(cuts) / seconds * 10, 2) if seconds else 0.0,
        'cuts_per_bar': round(len(cuts) / seconds * bar, 2) if seconds and bar else None,
        'holds': [],
    }
    for a, b in holds:
        if (b - a) / CLOCK >= HOLD_LIST_MIN - 1e-9:
            t = t0 + a / CLOCK
            br, bt = bar_beat(t, audio)
            out['holds'].append({'t': round(t, 3), 's': round((b - a) / CLOCK, 3), 'bar': br, 'beat': bt})
    return out


def judge(s, energy, targets):
    if energy == 'showcase':
        return []
    tg, fails = targets[energy], []
    if s['still_share'] > tg['still_max'] + 1e-9:
        fails.append(f"still {s['still_share']:.0%} > {tg['still_max']:.0%}")
    if s['longest_hold_s'] > tg['hold_max_s'] + 1e-9:
        h = max(s['holds'], key=lambda x: x['s'], default=None)
        where = f" at {h['t']:.2f}" + (f" (bar {h['bar']} beat {h['beat']})" if h and h['bar'] else '') if h else ''
        fails.append(f"hold {s['longest_hold_s']:.2f} s{where} > {tg['hold_max_s']:.2f} s")
    if s['median_motion'] < tg['motion_min'] - 1e-9:
        fails.append(f"motion {s['median_motion']:.1f} < {tg['motion_min']:.1f}")
    return fails


def photosensitivity(m, t0):
    tr = flash_transitions(m['lum'])
    flashes, at = max_flashes(tr)
    return {
        'transitions': [{'t': round(t0 + f / CLOCK, 3), 'dir': d, 'amp': round(a, 3)} for f, d, a in tr],
        'max_flashes_per_s': flashes, 'max_at': round(t0 + at, 3) if at is not None else None,
        'limit': FLASH_MAX, 'result': 'fail' if flashes > FLASH_MAX else 'pass',
    }


def per_second(m, t0):
    out = []
    tr = [f for f, _, _ in flash_transitions(m['lum'])]
    for k in range(int(np.ceil(m['n'] / CLOCK))):
        a, b = k * CLOCK, min(m['n'], (k + 1) * CLOCK)
        v = m['motion'][max(a, 1):b]
        out.append({'t': round(t0 + k, 3), 'area': round(float(m['area'][a:b].mean()), 4),
                    'still': round(float(m['still'][a:b].mean()), 3),
                    'motion': round(float(np.nanmean(v)), 2) if len(v) and not np.all(np.isnan(v)) else 0.0,
                    'gray': round(float(m['gray'][a:b].mean()), 1),
                    'cuts': sum(1 for i in m['cuts'] if a <= i < b), 'flash_transitions': sum(1 for f in tr if a <= f < b)})
    return out


def sheet(video, t, out):
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-ss', f'{max(0.0, t):.3f}', '-t', '1', '-i', video,
                    '-vf', 'fps=10,scale=320:-2,tile=5x2', '-frames:v', '1', out], check=False)


def creatable(path):
    """Whether path can be written once its missing folders are made: its nearest existing ancestor is a writable
    folder and it is not a folder itself."""
    d = os.path.dirname(os.path.abspath(path))
    while not os.path.exists(d):
        d = os.path.dirname(d)
    return not os.path.isdir(path) and os.path.isdir(d) and os.access(d, os.W_OK)


def check_outputs(a):
    """Refuse before decoding, so a rerun never wastes a full measurement. Missing folders are made when writing."""
    for path in (a.json, getattr(a, 'write_targets', None), a.sheets and os.path.join(a.sheets, 'sheet.jpg')):
        if path and os.path.abspath(path) == os.path.abspath(a.video):
            raise BadInput(f'{path} is the video; pick another output path')
        if path and not creatable(path):
            raise BadInput(f'{path}: cannot write there (a file in the way, or no write permission)')
    if a.json and os.path.exists(a.json) and not a.force:
        raise BadInput(f'{a.json} exists; pass --force to replace it')
    if a.sheets and os.path.isdir(a.sheets) and os.listdir(a.sheets) and not a.force:
        raise BadInput(f'{a.sheets} is not empty; pass --force to write sheets into it')


def targets_precheck(path, spans, force):
    """An existing targets file keeps the energies this run does not measure; replacing one needs --force."""
    energies = sorted({s['energy'] for s in spans if s['energy'] in DEFAULT_TARGETS})
    if not energies:
        raise BadInput('--write-targets: no calm, mid or high span (name a span by its energy, or add :energy)')
    if not os.path.exists(path):
        return {}
    load_targets(path)  # a broken file is bad input, never overwritten
    existing = load_json(path)
    clash = [e for e in energies if e in existing]
    if clash and not force:
        raise BadInput(f"{path} already sets {', '.join(clash)}; pass --force to replace them")
    return existing


def write_targets(path, existing, rows, video):
    """Per energy, the loosest of its spans plus margins, so every measured span passes its own targets."""
    by = {}
    for r in rows:
        if r['energy'] in DEFAULT_TARGETS and not r['short']:
            by.setdefault(r['energy'], []).append(r)
    if not by:
        raise BadInput('--write-targets: every calm, mid or high span is under 1 s')
    out = dict(existing)
    prov = existing.get('from')
    prov = dict(prov) if isinstance(prov, dict) else {'note': prov} if isinstance(prov, str) and prov else {}
    if any(e in existing for e in by):
        prov.pop('note', None)  # a note names no energy, so it may describe one this run replaces
    for e, rs in by.items():
        out[e] = {'still_max': round(min(1.0, max(r['still_share'] for r in rs) + 0.10), 3),
                  'hold_max_s': round(max(HOLD_LIST_MIN, 1.25 * max(r['longest_hold_s'] for r in rs)), 2),
                  'motion_min': round(0.7 * min(r['median_motion'] for r in rs), 2)}
        spans = ', '.join(f"{r['id']} {r['start']:g}-{r['end']:g} s" for r in rs)
        prov[e] = f'{video}: {spans}; margins {MARGINS}'
    out['from'] = prov
    save_json(out, path, indent=2)
    return out


def out_of_order(targets):
    """Each step from calm to mid to high where a target the gate uses loosens: motion_min falls, still_max or
    hold_max_s rises. A key the targets file omits counts at its default, as the gate reads it, marked (default)."""
    found = []
    for k, sign in (('motion_min', '>'), ('still_max', '<'), ('hold_max_s', '<')):
        seq = []
        for e in ('calm', 'mid', 'high'):
            own = targets.get(e) if isinstance(targets.get(e), dict) else {}
            seq.append((e, own[k], '') if k in own else (e, DEFAULT_TARGETS[e][k], ' (default)'))
        for (e0, v0, d0), (e1, v1, d1) in zip(seq, seq[1:]):
            if (v0 > v1) if sign == '>' else (v0 < v1):
                found.append(f'{k} {e0} {v0:g}{d0} {sign} {e1} {v1:g}{d1}')
    return found


def fmt_row(r):
    cpb = '-' if r.get('cuts_per_bar') is None else f"{r['cuts_per_bar']:.2f}"
    res = r['result'] + (' [' + '; '.join(r['failures']) + ']' if r.get('failures') else '')
    return (f"{r['id']:<14} {r['start']:7.2f}-{r['end']:<7.2f} {r['energy'] + ' (' + r['energy_from'] + ')':<20} "
            f"{r['still_share']:>5.0%} {r['longest_hold_s']:>5.2f} {r['median_motion']:>6.1f} "
            f"{r['cuts_per_10s']:>8.1f} {cpb:>8} {res}")


HEADER = f"{'section':<14} {'song time':<15} {'energy (source)':<20} {'still':>5} {'hold':>5} {'motion':>6} " \
         f"{'cuts/10s':>8} {'cuts/bar':>8} result"


def cut_density(rows):
    mean = {}
    for e in ('calm', 'mid', 'high'):
        vals = [r['cuts_per_bar'] if r['cuts_per_bar'] is not None else r['cuts_per_10s']
                for r in rows if r['energy'] == e and r['result'] != 'short']
        if vals:
            mean[e] = round(float(np.mean(vals)), 2)
    order = [mean[e] for e in ('calm', 'mid', 'high') if e in mean]
    return dict(mean, climbs=all(x <= y for x, y in zip(order, order[1:])))


def run_gate(a):
    check_outputs(a)
    w, h = probe(a.video)
    orient = orientation(w, h)
    only = [x.strip() for x in a.only.split(',') if x.strip()] if a.only else None
    if a.span:
        secs, src = parse_spans(a.span, names_free=False), '--span'
    else:
        secs = sections_from_timeline(load_timeline(), orient, a.variant, only)
        src = 'engine/timeline.js'
        if not secs:
            raise BadInput(f'no sections: nothing in engine/timeline.js renders on the {orient} canvas'
                           + (f' for --only {a.only}' if only else '') + ' (or pass --span)')
    tpath = a.targets or ('analysis/targets.json' if os.path.isfile('analysis/targets.json') else None)
    targets, tsrc = load_targets(tpath)
    try:
        audio = load_json('engine/data/audio.json') if os.path.isfile('engine/data/audio.json') else None
    except ValueError as e:
        raise BadInput(f'engine/data/audio.json: {e}')
    m = measure(a.video)
    t0, t1 = a.start, a.start + m['n'] / CLOCK
    rows, failed = [], []
    for s in secs:
        lo, hi = max(s['start'], t0), min(s['end'], t1)
        if hi <= lo:
            continue
        energy, efrom = energy_of(s, audio)
        fa, fb = frame_range(m, lo, hi, t0)
        row = {'id': s['id'], 'start': round(lo, 3), 'end': round(hi, 3), 'energy': energy, 'energy_from': efrom}
        row.update(summarize(m, fa, fb, t0, audio))
        if hi - lo < MIN_JUDGED_S - 1e-9:
            row.update(result='short', failures=[])
        else:
            fails = judge(row, energy, targets)
            row.update(result='exempt' if energy == 'showcase' else 'fail' if fails else 'pass', failures=fails)
            if fails:
                failed.append(row)
        rows.append(row)
    if not rows:
        raise BadInput(f'no sections between song time {t0:.2f} and {t1:.2f} (check --start)')
    warns = []
    edges = sorted((r['start'], r['end']) for r in rows)
    cursor = t0
    for lo, hi in edges + [(t1, t1)]:
        if lo - cursor > 1 / CLOCK:
            warns.append(f'WARN gap {cursor:.2f}-{lo:.2f} s: no section there (not judged)')
        cursor = max(cursor, hi)
    photo = photosensitivity(m, t0)
    density = cut_density(rows)
    if len([k for k in density if k != 'climbs']) > 1 and not density['climbs']:
        warns.append('WARN cut density does not climb with energy: '
                     + ', '.join(f'{e} {density[e]}' for e in ('calm', 'mid', 'high') if e in density))
    print(f"dynamism gate: {a.video}, song time {t0:.2f}-{t1:.2f} s, {orient} canvas"
          + (f', --only {a.only}' if only else f', variant {a.variant}') + f'; sections: {src}; targets: {tsrc}')
    print(HEADER)
    for r in rows:
        print(fmt_row(r))
    print(f"flashes: max {photo['max_flashes_per_s']:g} in 1 s" + (f" at {photo['max_at']:.2f}" if photo['max_at'] is not None else '')
          + f" (limit {FLASH_MAX}): {'FAIL' if photo['result'] == 'fail' else 'pass'}")
    for x in warns:
        print(x)
    bad = [f"{r['id']}@{r['start']:g}" for r in failed] + (['photosensitivity'] if photo['result'] == 'fail' else [])
    print('ALL GATES PASS' if not bad else 'GATE FAILED: ' + ', '.join(bad))
    if a.sheets:
        os.makedirs(a.sheets, exist_ok=True)
        for r in failed:
            for hd in r['holds']:
                if r['energy'] in targets and hd['s'] > targets[r['energy']]['hold_max_s']:
                    sheet(a.video, hd['t'] - t0 - 0.2, os.path.join(a.sheets, f"hold_{r['id']}_{hd['t']:.2f}.jpg"))
        if photo['result'] == 'fail':
            sheet(a.video, photo['max_at'] - t0, os.path.join(a.sheets, f"flashes_{photo['max_at']:.2f}.jpg"))
    if a.json:
        save_json({'video': a.video, 'start': t0, 'seconds': round(m['n'] / CLOCK, 3), 'size': m['size'],
                   'canvas': orient, 'variant': None if only else a.variant, 'only': only, 'sections_from': src,
                   'method': method(), 'targets': dict(targets, source=tsrc), 'sections': rows, 'photosensitivity': photo,
                   'cut_density': density, 'warnings': warns, 'per_second': per_second(m, t0),
                   'result': 'fail' if bad else 'pass', 'failed': bad}, a.json, indent=1)
    return 1 if bad else 0


def method():
    return {'clock_fps': CLOCK, 'analysis_long_side': LONG, 'motion_units': f'px per 1/{CLOCK} s at {REF_LONG} px',
            'motion_window_s': WINDOW / CLOCK, 'diff': DIFF, 'still_diff': STILL_DIFF, 'still_area': STILL_AREA,
            'still_flow_px': STILL_FLOW, 'still_drift_px': STILL_DRIFT, 'still_run_s': STILL_RUN / CLOCK,
            'cut_area': CUT_AREA, 'cut_return_s': CUT_RETURN / CLOCK, 'flash_delta': FLASH_DELTA,
            'flash_dark': FLASH_DARK, 'flash_max_per_s': FLASH_MAX}


def run_measure(a):
    check_outputs(a)
    if a.crop:
        parts = a.crop.split(':')
        if len(parts) != 4 or not all(p.isdigit() for p in parts):
            raise BadInput(f'--crop {a.crop}: expected W:H:X:Y in pixels')
    spans = parse_spans(a.span, names_free=True)
    existing = targets_precheck(a.write_targets, spans, a.force) if a.write_targets else None
    m = measure(a.video, a.crop)
    dur = m['n'] / CLOCK
    rows = []
    for s in spans + [{'id': 'whole', 'start': 0.0, 'end': dur, 'energy': None}]:
        lo, hi = max(0.0, s['start']), min(s['end'], dur)
        if hi <= lo:
            raise BadInput(f"--span {s['id']}: {s['start']:g}-{s['end']:g} s is outside the {dur:.2f} s video")
        fa, fb = frame_range(m, lo, hi, 0.0)
        row = {'id': s['id'], 'start': round(lo, 3), 'end': round(hi, 3), 'energy': s['energy']}
        row.update(summarize(m, fa, fb, 0.0, None), short=hi - lo < MIN_JUDGED_S - 1e-9)
        rows.append(row)
    photo = photosensitivity(m, 0.0)
    ps = per_second(m, 0.0)
    busiest = sorted(ps, key=lambda x: -x['area'])[:3]
    calmest = sorted([x for x in ps if x['gray'] >= 8], key=lambda x: x['area'])[:3]
    print(f"dynamism measure: {a.video}, {dur:.2f} s" + (f', crop {a.crop}' if a.crop else ''))
    print(f"{'span':<14} {'video time':<15} {'energy':<9} {'still':>5} {'hold':>5} {'motion':>6} {'cuts/10s':>8}")
    for r in rows:
        print(f"{r['id']:<14} {r['start']:7.2f}-{r['end']:<7.2f} {r['energy'] or '-':<9} {r['still_share']:>5.0%} "
              f"{r['longest_hold_s']:>5.2f} {r['median_motion']:>6.1f} {r['cuts_per_10s']:>8.1f}"
              + (' (short: under 1 s)' if r['short'] else ''))
    print(f"flashes: max {photo['max_flashes_per_s']:g} in 1 s (the gate's limit is {FLASH_MAX})")
    print('busiest seconds: ' + ', '.join(f"{x['t']:g}" for x in busiest)
          + '; calmest: ' + ', '.join(f"{x['t']:g}" for x in calmest))
    if a.sheets:
        os.makedirs(a.sheets, exist_ok=True)
        for kind, xs in (('busiest', busiest), ('calmest', calmest)):
            for x in xs:
                sheet(a.video, x['t'], os.path.join(a.sheets, f"{kind}_{x['t']:g}.jpg"))
    if a.write_targets:
        tg = write_targets(a.write_targets, existing, rows[:-1], a.video)
        print(f'wrote {a.write_targets}: ' + json.dumps({k: v for k, v in tg.items() if k != 'from'}))
        bad = out_of_order(tg)
        if bad:
            print('WARN targets out of order across energies: ' + '; '.join(bad) + '. From calm to mid to high, '
                  'motion_min should not fall, nor still_max or hold_max_s rise. Label each span with the energy of '
                  'the song section it stands in for. A (default) value is one the file omits: measure a span of '
                  'that energy, or set it by hand')
    if a.json:
        save_json({'video': a.video, 'seconds': round(dur, 3), 'size': m['size'], 'crop': a.crop, 'method': method(),
                   'spans': rows, 'photosensitivity': photo, 'per_second': ps, 'busiest': busiest,
                   'calmest': calmest}, a.json, indent=1)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog='dynamism_check.py', usage=__doc__.split('usage:\n', 1)[1].split('gate runs')[0])
    sub = ap.add_subparsers(dest='cmd')
    g = sub.add_parser('gate')
    g.add_argument('video'); g.add_argument('--start', type=float, default=0.0)
    g.add_argument('--variant', default='a'); g.add_argument('--only')
    g.add_argument('--span', action='append'); g.add_argument('--targets')
    g.add_argument('--json'); g.add_argument('--sheets'); g.add_argument('--force', action='store_true')
    me = sub.add_parser('measure')
    me.add_argument('video'); me.add_argument('--span', action='append'); me.add_argument('--crop')
    me.add_argument('--write-targets'); me.add_argument('--json'); me.add_argument('--sheets')
    me.add_argument('--force', action='store_true')
    a = ap.parse_args(argv)
    if not a.cmd:
        ap.print_usage(sys.stderr)
        return 2
    try:
        return run_gate(a) if a.cmd == 'gate' else run_measure(a)
    except BadInput as e:
        print(f'error: {e}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
