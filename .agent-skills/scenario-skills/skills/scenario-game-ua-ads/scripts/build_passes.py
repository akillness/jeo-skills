#!/usr/bin/env python3
"""Write the compose payloads of an ad's picture and sound passes, and sum its sound locally.

Usage:
  python3 build_passes.py picture plan.json [-o payload_picture.json]
  python3 build_passes.py simulate plan.json [-o sim.wav] [--tp-target -1.8]
  python3 build_passes.py sound plan.json SILENT_MASTER_ASSET_ID [-o payload_sound.json]

Needs numpy and ffmpeg; picture also needs Pillow.

picture: the picture-pass payload for model_scenario-compose-video. Every video layer is muted,
  no audio layer goes in, compressionLevel is 15. Composed, it gives the silent master.
  - A video layer gets the times that show exactly its start to end frames: half a frame early in
    (frame 0 starts on 0), a quarter frame early out (frames 170 to 240 at 30 fps: 5.65 to 7.991
    s). A start rounded down to the millisecond can lose the clip's last frame, a black frame at a
    hard cut. A local clip more than half a frame shorter than its window after its trims is noted,
    since compose freezes its last frame.
  - An image layer starts on its frame time, rounded down to the millisecond, and ends half a
    frame before its end frame (frame 156 at 30 fps ends at 5.183 s): compose draws an image on
    the frame at exactly its endTime.
  - Any endTime from layers.json or the plan that sits on a frame time is pulled back half a frame.
  - Image layers appear one or two frames after their startTime; video layers appear on it. An
    image that must show on a cut's first frame starts a frame or two early, or becomes a track.
  - Compose draws an image under about 300 px on a side at the wrong scale. An image layer under
    304 px on a side, positioned by number, is padded with transparent margin into <name>.pad.png
    beside its file, placed so its visible pixels stay put: upload that copy and map it in "assets".
simulate: sums the sound pass from the local files as the payload lays it out, with no limiter, as
  compose has none. Compose plays the platform's 128 kbps mp3 copy of each upload, which removes
  everything above 16 kHz, so every file is low-passed at 16 kHz first. It prints:
  - integrated LUFS and true peak (ebur128), and the sample peak;
  - when the true peak is over the target, the 50 ms windows over it (or the three loudest) and
    the hits sounding there;
  - per hit, its peak margin over the music and beds, and over everything else (music, beds and
    the other hits), in 50 ms windows at its first attack, at its loudest point and at every later
    attack within 12 dB of it, so a premixed stem is checked hit by hit. LOW: under 4 dB over the
    music. MASKED: under 0 dB over everything else, naming the hits that cover it;
  - a file whose sound starts more than 10 ms in, an attack more than a frame after the sound
    starts, and a file with most of its energy above 16 kHz (it plays quieter: re-voice it lower).
  The default target, -1.8 dBTP, leaves room for compose's AAC encode, which moved the true peak
  by -0.3 to +0.8 dB in tests. Trim until the true peak is at or under it while every hit keeps
  4 dB over the music.
sound: the sound-pass payload (the silent master as the one video layer, then every audio layer)
  and cues.json beside it, for check_master.py.

plan.json (paths relative to it; picture times are frame numbers, sound times seconds or "frame"):
{
  "fps": 30, "canvas": [1080, 1920], "duration": 15.0, "sections": [0, 5.2, 11.1],
  "assets": {"fail.mp4": "<asset id>", "hand_fail.mov": "<asset id>", "tap.wav": "<asset id>"},
  "tracks": "tracks/layers.json",
  "picture": [
    {"file": "fail.mp4", "type": "video", "start": 0, "end": 156, "trimEnd": 2.8},
    {"track": "hand_fail"},
    {"file": "overlays/fail.png", "type": "image", "x": 244, "y": 400, "start": 72, "end": 108,
     "transitionIn": "zoomin", "transitionDuration": 0.2},
    {"still": "icon_pop"}
  ],
  "sound": {
    "master_db": -4,
    "music": [{"file": "music.mp3", "offset": 2.0, "start": 0, "end": 12.9,
               "gains": [[0, -4], [2.25, -8], [3.6, -10]]}],
    "beds": [{"file": "bed.mp3", "t": 3.7, "gain_db": -2}],
    "hits": [{"label": "tap", "file": "tap.wav", "frame": 13, "gain_db": -2, "trim_db": -1}]
  }
}
- assets maps each uploaded file (its name or its path in the plan) to its asset id. A layer may
  give "source" directly instead of "file".
- picture: list order is the stacking order unless a layer sets zIndex. "track" and "still" take
  the layer render_tracks.py wrote ("group/child" for a still inside a group); a track marked
  "same_as" takes that file's asset id when its own file has none. Other compose keys pass through.
  A video defaults to the full canvas with fit "cover"; an image gets its natural width and height
  from the file, since compose draws an unsized image at the wrong scale.
- music: one read of the file, file time = ad time + offset. It starts at "start", or at the first
  "gains" time when start is omitted (gains [[2.0, -6]] alone starts the music at 2 s). "gains"
  steps the gain in dB at each time, the last entry at or before start setting the level at start.
  Every duck splits the read into segments with their own trimStart and 10 ms fades at each split;
  fade_in_s and fade_out_s set the outer fades. end defaults to the file's end.
- beds: video-to-audio tracks, "t" or "frame", gain_db, optional trimStart and end. Past 49
  audio layers they are dropped first.
- hits: "frame" or "t", gain_db, trim_db (a per-hit trim against peaks), trimStart (seconds into
  the file), dur_s. A hit's sound starts at 0 in its file, or at its trimStart, so its time is the
  event's time.
- master_db trims every audio layer. Volumes are linear (10^(dB/20), 3 decimals, at most 2).
"""

import argparse
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np

SR = 48000
MAX_LAYERS = 50
MAX_AUDIO = MAX_LAYERS - 1
MIN_IMAGE = 304
TP_TARGET = -1.8
PICTURE_KEYS = ("file", "start", "end", "track", "still")


class PlanError(Exception):
    pass


def floor_ms(t):
    return math.floor(t * 1000 + 1e-6) / 1000


def frame_ms(n, fps):
    """Compose time of a frame. Rounded up (185 / 30 as 6.167), a layer starts one frame late."""
    return n * 1000 // fps / 1000


def frame_end(n, fps):
    """endTime of an image layer that stops before frame n: half a frame early, as compose draws an image on its endTime."""
    return (n * 1000 // fps - round(500 / fps)) / 1000


def video_times(first, end, fps):
    """startTime and endTime of a video layer showing frames first to end - 1.

    Compose can drop the last frame of a video layer whose start falls just before a frame, as a
    frame time rounded down to the millisecond does (185 / 30 as 6.166): a black frame at a hard
    cut. Half a frame early in and a quarter frame early out shows exactly these frames whichever
    way compose rounds, and frame 0 starts on 0.
    """
    start = 0.0 if first == 0 else math.floor((first - 0.5) * 1000 / fps) / 1000
    return start, math.floor((end - 0.25) * 1000 / fps) / 1000


def video_seconds(path):
    """Length of the first video stream: a container's own length follows its longest stream."""
    for entry in ("stream=duration", "format=duration"):
        out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", entry, "-of", "csv=p=0",
                              str(path)], capture_output=True, text=True).stdout.strip()
        try:
            return float(out)
        except ValueError:
            continue
    raise PlanError(f"ffprobe could not read the length of {path}")


def early_end(t, fps):
    """An endTime within a millisecond of a frame time, pulled back half a frame; any other time unchanged."""
    k = round(t * fps)
    return max(0.0, frame_end(k, fps)) if abs(t - k / fps) < 0.001 else t


def db(x):
    return 20 * math.log10(x) if x > 1e-9 else float("-inf")


def volume(gain_db):
    return min(2.0, round(10 ** (gain_db / 20), 3))


def number(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return int(f) if f.is_integer() else None


def lowpass(x, lo=15500.0, hi=16500.0):
    """Remove what lies above about 16 kHz, with a raised-cosine edge, as a 128 kbps mp3 copy does."""
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = 0.5 - 0.5 * np.cos(np.pi * np.clip((hi - f) / (hi - lo), 0, 1))
    spec = np.fft.rfft(x, axis=0) * (g[:, None] if x.ndim > 1 else g)
    return np.fft.irfft(spec, len(x), axis=0).astype(np.float32)


_audio = {}


def load_audio(path, low=False):
    """Stereo float32 at 48 kHz, low-passed at 16 kHz when low is true."""
    key = (str(path), low)
    if key not in _audio:
        if low:
            _audio[key] = lowpass(load_audio(path))
        else:
            raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "2", "-ar", str(SR), "-f", "f32le",
                                  "-"], capture_output=True, check=True).stdout
            _audio[key] = np.frombuffer(raw, np.float32).reshape(-1, 2)
    return _audio[key]


def write_wav(path, x):
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2", "-i", "-",
                    "-c:a", "pcm_f32le", str(path)], input=np.ascontiguousarray(x, np.float32).tobytes(), check=True)


def loudness(path):
    """Integrated LUFS and true peak (dBTP) from ffmpeg's ebur128 summary."""
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "ebur128=peak=true",
                          "-f", "null", "-"], capture_output=True, text=True).stderr
    if "Summary:" not in err:
        raise PlanError(f"ebur128 gave no summary for {path}")
    s = err.rsplit("Summary:", 1)[1]
    number_re = r"([-+]?(?:\d+(?:\.\d+)?|inf))"
    return (float(re.search(r"I:\s*" + number_re + r"\s*LUFS", s).group(1)),
            float(re.search(r"Peak:\s*" + number_re + r"\s*dBFS", s).group(1)))


def window_true_peaks(x, win, up=4):
    """Peak of each win-sample window of x after up-times FFT oversampling (a true-peak estimate), in dB."""
    n, block, margin = len(x), 2 * SR, SR // 10
    out = np.zeros(n * up, np.float32)
    for s in range(0, n, block):
        a, e, b = max(0, s - margin), min(n, s + block), min(n, s + block + margin)
        spec = np.fft.rfft(x[a:b], axis=0)
        big = np.zeros(((b - a) * up // 2 + 1, x.shape[1]), complex)
        big[:len(spec)] = spec
        y = np.abs(np.fft.irfft(big, (b - a) * up, axis=0) * up).max(axis=1)
        out[s * up:e * up] = y[(s - a) * up:(e - a) * up]
    k = -(-n // win)
    out = np.pad(out, (0, k * win * up - len(out)))
    return [db(float(v)) for v in out.reshape(k, win * up).max(axis=1)]


class Plan:
    def __init__(self, path):
        self.path = Path(path)
        self.base = self.path.parent
        self.raw = json.loads(self.path.read_text())
        self.fps = self.raw.get("fps", 30)
        self.canvas = tuple(self.raw.get("canvas", (1080, 1920)))
        self.duration = float(self.raw["duration"])
        self.assets = self.raw.get("assets", {})

    def file(self, name):
        return self.base / name

    def asset(self, name):
        for key in (name, Path(name).name):
            if key in self.assets:
                return self.assets[key]
        raise PlanError(f"no asset id for {name}: upload it and add it to \"assets\"")

    def time(self, item, key="t"):
        if "frame" in item:
            return frame_ms(item["frame"], self.fps)
        return floor_ms(item[key])

    def settings(self, compression):
        return {"canvasMode": "custom", "canvasWidth": self.canvas[0], "canvasHeight": self.canvas[1],
                "durationMode": "custom", "duration": self.duration, "fps": self.fps,
                "compressionLevel": compression, "backgroundColor": "#000000"}


def pil_image():
    from PIL import Image  # imported here so simulate, sound and check_master.py run without Pillow
    return Image


def pad_span(pos, size, limit):
    """Margin before and after a span shorter than MIN_IMAGE, kept inside 0..limit when it fits."""
    need = max(0, MIN_IMAGE - size)
    lo = max(0, min(pos - need // 2, limit - size - need))
    before = min(max(pos - lo, 0), need)
    return before, need - before


def pad_image(path, x, y, canvas):
    """Write path padded to MIN_IMAGE a side as <stem>.pad.png; return it with its new x, y, width, height."""
    Image = pil_image()
    with Image.open(path) as im:
        left, right = pad_span(x, im.width, canvas[0])
        top, bottom = pad_span(y, im.height, canvas[1])
        out = Image.new("RGBA", (im.width + left + right, im.height + top + bottom), (0, 0, 0, 0))
        out.paste(im.convert("RGBA"), (left, top))
    target = path.with_name(f"{path.stem}.pad.png")
    out.save(target)
    return target, x - left, y - top, out.width, out.height


def picture_payload(plan):
    tracks = {}
    if "tracks" in plan.raw:
        tracks = json.loads(plan.file(plan.raw["tracks"]).read_text())["layers"]
    layers, notes, missing = [], [], []

    def asset(name):
        try:
            return plan.asset(name)
        except PlanError:
            missing.append(name)
            return None

    def track_asset(entry):
        if "same_as" in entry:
            try:
                return plan.asset(entry["file"])
            except PlanError:
                return asset(entry["same_as"])
        return asset(entry["file"])

    for i, e in enumerate(plan.raw["picture"]):
        extra = {k: v for k, v in e.items() if k not in PICTURE_KEYS}
        if "track" in e:
            entry = tracks.get(e["track"]) or {}
            if "layer" not in entry:
                raise PlanError(f"no track {e['track']!r} in {plan.raw.get('tracks')}")
            lay = {**entry["layer"], "source": track_asset(entry)}
        elif "still" in e:
            group, _, child = e["still"].partition("/")
            entry = tracks.get(group, {})
            entry = entry.get("parts", {}).get(child, {}) if child else entry
            if "still" not in entry:
                raise PlanError(f"no still for {e['still']!r}: give its icon_pop an \"until\" frame")
            lay = {**entry["still"], "source": asset(entry["still"]["source"])}
        else:
            if "start" not in e or "end" not in e:
                raise PlanError(f"picture layer {i} needs start and end frames")
            if extra.get("type") == "video":
                start, end = video_times(e["start"], e["end"], plan.fps)
            else:
                start, end = frame_ms(e["start"], plan.fps), frame_ms(e["end"], plan.fps)
            lay = {"startTime": start, "endTime": end}
            source = e.get("source")
            if extra.get("type") == "video":
                lay.update({"x": "0", "y": "0", "width": str(plan.canvas[0]), "height": str(plan.canvas[1]), "fit": "cover"})
                if "file" in e and plan.file(e["file"]).is_file():
                    have = video_seconds(plan.file(e["file"])) - extra.get("trimStart", 0) - extra.get("trimEnd", 0)
                    need = (e["end"] - e["start"]) / plan.fps
                    if have < need - 0.5 / plan.fps:
                        notes.append(f"layer {i}: {e['file']} has {have:.3f} s after its trims for a {need:.3f} s "
                                     "window; compose freezes its last frame for the rest: shorten the window")
            elif extra.get("type") == "image":
                sized = "width" in extra or "height" in extra
                if not sized and "file" not in e:
                    raise PlanError(f"image layer {i} needs its file or an explicit width and height")
                if "file" in e and not sized:
                    with pil_image().open(plan.file(e["file"])) as im:
                        lay.update({"width": im.width, "height": im.height})
                    x, y = number(extra.get("x", 0)), number(extra.get("y", 0))
                    if min(lay["width"], lay["height"]) < MIN_IMAGE and x is not None and y is not None:
                        path, x, y, w, h = pad_image(plan.file(e["file"]), x, y, plan.canvas)
                        name = str(Path(e["file"]).with_name(path.name))
                        source = asset(name)
                        lay.update({"width": w, "height": h})
                        extra.update({"x": x, "y": y})
                        notes.append(f"layer {i}: {e['file']} padded to {w}x{h} at {x},{y} -> {name}")
                lay["fit"] = "fill"
            lay["source"] = source or asset(e["file"])
        lay.update(extra)
        if lay.get("type") == "audio":
            raise PlanError("the picture pass takes no audio layer: put sounds in the sound pass")
        if lay.get("type") == "video":
            lay["mute"] = True
        for k in ("x", "y", "width", "height"):
            if k in lay:
                lay[k] = str(lay[k])
        lay.setdefault("zIndex", i)
        lay["endTime"] = early_end(lay["endTime"], plan.fps)
        if lay.get("type") == "image" and min(float(lay["width"]), float(lay["height"])) < MIN_IMAGE:
            notes.append(f"layer {i} ({lay['source']}): an image under {MIN_IMAGE} px on a side; pad it to "
                         f"{MIN_IMAGE} px with transparent margin")
        if lay["endTime"] > plan.duration:
            notes.append(f"layer {i} ({lay['source']}): ends at {lay['endTime']} s, past the {plan.duration} s ad")
        layers.append(lay)
    if missing:
        raise PlanError(f"no asset id for {', '.join(dict.fromkeys(missing))}: upload them and add them to \"assets\"")
    if len(layers) > MAX_LAYERS:
        raise PlanError(f"{len(layers)} layers: compose takes {MAX_LAYERS}. Merge tracks into a group.")
    return {"layers": layers, **plan.settings(15)}, notes


def music_gains(m):
    """The read's (time, gain) steps from its start: the last gains entry at or before start sets the start level."""
    gains = sorted(m["gains"])
    start = m.get("start", gains[0][0])
    if gains[0][0] > start:
        raise PlanError(f"music {m['file']}: gains need an entry at or before its start, {start} s")
    level = [g for t, g in gains if t <= start][-1]
    return [(start, level)] + [(t, g) for t, g in gains if t > start]


def sound_rows(plan, with_ids=True):
    """Every audio layer of the sound pass as (role, label, file, layer), and the notes."""
    snd, notes, rows = plan.raw["sound"], [], []
    master, end_all = snd.get("master_db", 0.0), plan.duration

    def source(f):
        return plan.asset(f) if with_ids else Path(f).name

    def length(f, trim=0.0):
        return len(load_audio(plan.file(f))) / SR - trim

    for m in snd.get("music", []):
        offset, gains = m.get("offset", 0.0), music_gains(m)
        end = min(end_all, m.get("end", length(m["file"]) - offset))
        cuts = [(t, g) for t, g in gains if t < end]
        for k, (t0, gain) in enumerate(cuts):
            t1 = cuts[k + 1][0] if k + 1 < len(cuts) else end
            if t0 + offset < 0:
                raise PlanError(f"music {m['file']}: offset {offset} reads before the file starts at {t0} s")
            lay = {"source": source(m["file"]), "type": "audio", "startTime": floor_ms(t0), "endTime": floor_ms(t1),
                   "volume": volume(gain + master)}
            if t0 + offset > 0:
                lay["trimStart"] = floor_ms(t0 + offset)
            lay["audioFadeIn"] = m.get("fade_in_s", 0.01) if k == 0 else 0.01
            lay["audioFadeOut"] = m.get("fade_out_s", 0.01) if k == len(cuts) - 1 else 0.01
            rows.append(("music", m.get("label", f"music {Path(m['file']).name} {t0:g}s"), m["file"], lay))
    for b in snd.get("beds", []):
        t0, trim = plan.time(b), b.get("trimStart", 0.0)
        t1 = min(end_all, floor_ms(b["end"]) if "end" in b else floor_ms(t0 + length(b["file"], trim)))
        lay = {"source": source(b["file"]), "type": "audio", "startTime": t0, "endTime": t1,
               "volume": volume(b.get("gain_db", 0.0) + master)}
        if trim:
            lay["trimStart"] = floor_ms(trim)
        for key, name in (("fade_in_s", "audioFadeIn"), ("fade_out_s", "audioFadeOut")):
            if key in b:
                lay[name] = b[key]
        rows.append(("bed", b.get("label", f"bed {Path(b['file']).name}"), b["file"], lay))
    for h in snd.get("hits", []):
        t0, trim = plan.time(h), h.get("trimStart", 0.0)
        t1 = min(end_all, floor_ms(t0 + h.get("dur_s", length(h["file"], trim))))
        gain = h.get("gain_db", 0.0) + h.get("trim_db", 0.0) + master
        lay = {"source": source(h["file"]), "type": "audio", "startTime": t0, "endTime": t1, "volume": volume(gain)}
        if trim:
            lay["trimStart"] = floor_ms(trim)
        if 10 ** (gain / 20) > 2:
            notes.append(f"{h.get('label', h['file'])}: {gain:+.1f} dB is over the volume cap of 2, clamped")
        rows.append(("hit", h.get("label", Path(h["file"]).stem), h["file"], lay))
    if len(rows) > MAX_AUDIO:
        beds = [r for r in rows if r[0] == "bed"]
        rows = [r for r in rows if r[0] != "bed"]
        notes += [f"dropped {label}: past {MAX_AUDIO} audio layers the bed goes first" for _, label, _, _ in beds]
    if len(rows) > MAX_AUDIO:
        raise PlanError(f"{len(rows)} audio layers without the beds: compose takes {MAX_AUDIO} beside the silent "
                        "master. Cut or merge hits.")
    return rows, notes


def render_layer(plan, file, lay, total):
    """One audio layer as compose lays it out (trim, volume, linear fades): its first sample and its samples."""
    x = load_audio(plan.file(file), low=True)
    s0 = round(lay.get("trimStart", 0) * SR)
    y = x[s0:s0 + round((lay["endTime"] - lay["startTime"]) * SR)] * np.float32(lay["volume"])
    fade_in = min(len(y), round(lay.get("audioFadeIn", 0) * SR))
    fade_out = min(len(y), round(lay.get("audioFadeOut", 0) * SR))
    if fade_in:
        y[:fade_in] *= np.linspace(0, 1, fade_in, dtype=np.float32)[:, None]
    if fade_out:
        y[-fade_out:] *= np.linspace(1, 0, fade_out, dtype=np.float32)[:, None]
    p = round(lay["startTime"] * SR)
    return p, y[:max(0, total - p)]


def window_peaks(x, win):
    a = np.abs(x).max(axis=1) if x.ndim > 1 else np.abs(x)
    k = -(-len(a) // win)
    return np.pad(a, (0, k * win - len(a))).reshape(k, win).max(axis=1)


def hit_margins(p, y, full, music, others, win):
    """Margins (dB) of one hit over the music and beds and over everything else, at its attacks.

    Windows of win samples from the hit's start: the first, the loudest, and every one at least 6 dB
    over the one before, among those within 12 dB of the loudest. Returns (over music, over all, time
    of the worst window over all from the start, labels of the other hits loudest there) or None.
    """
    n = len(y)
    if not n or not np.abs(y).max() > 0:
        return None
    own = window_peaks(y, win)
    rest = window_peaks(full[p:p + n] - y, win)
    bed = window_peaks(music[p:p + n], win)
    top = own.max()
    picks = {0, int(own.argmax())} | {w for w in range(1, len(own)) if own[w] >= 2 * own[w - 1]}
    picks = sorted(w for w in picks if own[w] >= top / 4)
    over_music = min(db(own[w]) - db(bed[w]) for w in picks)
    worst = min(picks, key=lambda w: db(own[w]) - db(rest[w]))
    a, b = p + worst * win, p + (worst + 1) * win
    loud = sorted(((float(np.abs(oy[max(0, a - op):max(0, b - op)]).max(initial=0)), label)
                   for label, op, oy in others if op < b and op + len(oy) > a), reverse=True)
    return over_music, db(own[worst]) - db(rest[worst]), worst * win / SR, [label for v, label in loud[:2] if v > 0]


def onsets(plan, file, trim=0.0):
    """ms from the trim point to the file's first sound (within 50 dB of its peak) and to its attack.

    The attack is the first sample within 30 dB of the loudest point in the 150 ms after the first
    sound. A kit sound with a soft 8 ms fade-in starts near 0 and attacks about 12 ms in: both fine.
    """
    x = np.abs(load_audio(plan.file(file))[round(trim * SR):]).max(axis=1)
    if not x.size or x.max() <= 0:
        return None, None
    s = int(np.argmax(x > x.max() * 10 ** (-50 / 20)))
    w = x[s:s + round(0.15 * SR)]
    return 1000 * s / SR, 1000 * (s + int(np.argmax(w > w.max() * 10 ** (-30 / 20)))) / SR


def high_share(plan, file, lay):
    """Share of the energy of the part of file a layer plays that lies above 16 kHz."""
    x = load_audio(plan.file(file)).mean(axis=1)
    s0 = round(lay.get("trimStart", 0) * SR)
    x = x[s0:s0 + round((lay["endTime"] - lay["startTime"]) * SR)]
    if not x.size:
        return 0.0
    power = np.abs(np.fft.rfft(x)) ** 2
    total = power.sum()
    return float(power[np.fft.rfftfreq(len(x), 1 / SR) > 16000].sum() / total) if total > 0 else 0.0


def simulate(plan, out, tp_target=TP_TARGET):
    rows, notes = sound_rows(plan, with_ids=False)
    total = round(plan.duration * SR)
    full, music, hits = np.zeros((total, 2), np.float32), np.zeros((total, 2), np.float32), []
    for role, label, file, lay in rows:
        p, y = render_layer(plan, file, lay, total)
        full[p:p + len(y)] += y
        if role == "hit":
            hits.append((label, file, lay, p, y))
        else:
            music[p:p + len(y)] += y
    write_wav(out, full)
    lufs, tp = loudness(out)
    peak = db(float(np.abs(full).max()))
    print(f"simulated sound pass, {len(rows)} audio layers, low-passed at 16 kHz: {lufs:.1f} LUFS, true peak "
          f"{tp:+.1f} dBTP, sample peak {peak:+.1f} dBFS (no limiter) -> {out}")
    win = SR // 20
    if tp > tp_target:
        print(f"  true peak over the {tp_target:g} dBTP target, which leaves room for the AAC encode (it moved the true "
              "peak by -0.3 to +0.8 dB in tests): lower master_db, or trim_db on the hits sounding in the windows below")
        tpw = window_true_peaks(full, win)
        over = [k for k, v in enumerate(tpw) if v > tp_target] or sorted(sorted(range(len(tpw)), key=lambda k: -tpw[k])[:3])
        for k in over:
            active = [label for label, _, _, p, y in hits if p < (k + 1) * win and p + len(y) > k * win]
            print(f"  {tpw[k]:+5.1f} dBTP at {k * win / SR:6.2f} s: {', '.join(active) or 'music and beds only'}")
    if not -16 <= lufs <= -14:
        print("  outside -16 to -14 LUFS: adjust master_db, or plan the loudness pass")
    report = {"lufs": lufs, "true_peak": tp, "sample_peak": peak, "hits": []}
    others = [(label, p, y) for label, _, _, p, y in hits]
    warned = set()
    for label, file, lay, p, y in hits:
        m = hit_margins(p, y, full, music, [o for o in others if o[2] is not y], win)
        over_music, over_all, at, masked = m if m else (None, None, None, [])
        start, attack = onsets(plan, file, lay.get("trimStart", 0.0))
        share = high_share(plan, file, lay)
        flags = []
        if over_music is not None and over_music < 4:
            flags.append("LOW")
        if over_all is not None and over_all < 0 and masked:
            flags.append(f"MASKED by {', '.join(masked)} at +{at:.2f} s")
        if start is not None and start > 10:
            flags.append(f"sound starts {start:.0f} ms in: raise its trimStart by that much")
        if attack is not None and attack - start > 1000 / plan.fps:
            flags.append(f"attack {attack:.0f} ms in: place the hit {attack:.0f} ms earlier or trim the lead")
        if share > 0.5 and file not in warned:
            warned.add(file)
            flags.append(f"{share:.0%} of its energy above 16 kHz plays {-10 * math.log10(1 - min(share, 0.999)):.0f} dB "
                         "quieter: re-voice or pitch it down")

        def shown(v, none):
            return "silent" if v is None else (none if math.isinf(v) else f"{v:+5.1f} dB")

        print(f"  {lay['startTime']:7.3f} s  {label:24s} vol {lay['volume']:5.3f}  over music {shown(over_music, 'no music')}"
              f"  over all {shown(over_all, 'alone')}  {'  '.join(flags)}")
        report["hits"].append({"label": label, "t": lay["startTime"], "margin_db": over_music, "margin_all_db": over_all,
                               "masked_by": masked, "worst_at": at, "onset_ms": start, "attack_ms": attack,
                               "high_share": share})
    for n in notes:
        print(f"NOTE {n}", file=sys.stderr)
    return report


def sound_payload(plan, silent_id):
    rows, notes = sound_rows(plan)
    W, H = plan.canvas
    layers = [{"source": silent_id, "type": "video", "startTime": 0.0, "endTime": plan.duration, "x": "0", "y": "0",
               "width": str(W), "height": str(H), "fit": "cover", "mute": True, "zIndex": 0}]
    layers += [lay for _, _, _, lay in rows]
    cues = {"duration": plan.duration, "fps": plan.fps, "canvas": list(plan.canvas),
            "sections": plan.raw.get("sections", [0]),
            "cues": [{"label": label, "role": role, "file": str(plan.file(file).resolve()), "t": lay["startTime"],
                      "end": lay["endTime"], "trimStart": lay.get("trimStart", 0.0), "volume": lay["volume"]}
                     for role, label, file, lay in rows]}
    return {"layers": layers, **plan.settings(18)}, cues, notes



def same_file(a, b):
    """True when two paths name one file, so an output would overwrite an input."""
    return a is not None and b is not None and Path(a).resolve() == Path(b).resolve()

def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("picture", "simulate", "sound"):
        p = sub.add_parser(name)
        p.add_argument("plan", type=Path)
        if name == "sound":
            p.add_argument("silent_master", help="asset id of the composed picture pass")
        if name == "simulate":
            p.add_argument("--tp-target", type=float, default=TP_TARGET, help="true-peak target in dBTP")
        p.add_argument("-o", "--out", type=Path)
    args = ap.parse_args(argv)
    default = {"picture": "payload_picture.json", "simulate": "sim.wav", "sound": "payload_sound.json"}[args.cmd]
    out = args.out or args.plan.parent / default
    outs = [out, out.parent / "cues.json"] if args.cmd == "sound" else [out]
    if any(same_file(o, args.plan) for o in outs):
        print(f"error: this run would overwrite the plan {args.plan}; pass -o elsewhere", file=sys.stderr)
        return 2
    try:
        plan = Plan(args.plan)
        if args.cmd == "picture":
            payload, notes = picture_payload(plan)
            out = args.out or plan.base / "payload_picture.json"
            out.write_text(json.dumps(payload, indent=1) + "\n")
            print(f"picture pass: {len(payload['layers'])} layers -> {out}")
        elif args.cmd == "simulate":
            simulate(plan, args.out or plan.base / "sim.wav", args.tp_target)
            notes = []
        else:
            payload, cues, notes = sound_payload(plan, args.silent_master)
            out = args.out or plan.base / "payload_sound.json"
            out.write_text(json.dumps(payload, indent=1) + "\n")
            (out.parent / "cues.json").write_text(json.dumps(cues, indent=1) + "\n")
            print(f"sound pass: {len(payload['layers']) - 1} audio layers -> {out}, cues -> {out.parent / 'cues.json'}")
    except (PlanError, KeyError) as e:
        print(f"error: {e if isinstance(e, PlanError) else f'missing key {e}'}", file=sys.stderr)
        return 2
    for n in notes:
        print(f"NOTE {n}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
