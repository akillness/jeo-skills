"""Mix the film's soundtrack: the music bed plus a sound effect on every cue the blocks registered.

usage: mix.py <film folder> [--out out/mix.wav] [--lufs -14] [--no-music] [--kit DIR] [--info FILE]

Cues (whips, slams, typing, pops...) come from the film's own cue list (info.mjs, or --info). Sounds come
from <film>/audio/sfx/: one file per kit name (whoosh.wav, impact.mp3...), variants name_1, name_2 rotate.
The core kit is 12 sounds and every other cue name falls back to one of them. A custom sound (stomp.wav)
plays on cues of its name from spec.cues, at the level set in spec.sounds. The music ducks under the big
hits. Two-pass loudness normalization to the target, true peak -1 dBTP.
"""

import argparse
import glob
import json
import os
import subprocess
import sys
import wave

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filmserver import film_info  # noqa: E402

SR = 48000
AUDIO = (".wav", ".mp3", ".m4a", ".aif", ".aiff", ".flac")
# cue name: [(kit names, the first that exists | align: onset, peak, end or loop | offset s | level dB)]
MAP = {
    'key': [('key', 'onset', 0, -19)], 'tick': [('tick', 'onset', 0, -15)], 'pop': [('pop', 'onset', 0, -15)],
    'thock': [('thock|pop', 'onset', 0, -9)], 'whoosh': [('whoosh', 'peak', .12, -12)], 'whoosh_big': [('whoosh_big|whoosh', 'peak', .14, -5)],
    'impact': [('impact', 'onset', 0, -2)], 'impact_big': [('impact_big|impact', 'onset', 0, -3)], 'hit': [('hit|impact', 'onset', 0, -2)],
    'slash': [('slash|whoosh', 'peak', .05, -3.5)], 'sparkle': [('sparkle|tick', 'onset', 0, -19)], 'glitch': [('glitch', 'onset', 0, -13)],
    'power_down': [('power_down|glitch', 'onset', 0, -12)], 'draw': [('draw|whoosh', 'onset', 0, -14)], 'riser': [('riser', 'end', 0, -9)],
    'drop': [('drop|impact_big|impact', 'onset', 0, -4)], 'stretch': [('stretch|whoosh', 'onset', 0, -12)], 'squeeze': [('stretch|whoosh', 'onset', 0, -15)],
    'send': [('send|key', 'onset', 0, -3), ('whoosh', 'peak', .1, -14)], 'click': [('click|key', 'onset', 0, -1.5), ('impact', 'onset', 0, -10)],
    'scroll': [('scroll|whoosh', 'onset', 0, -17)], 'tick_run': [('tick_run|tick', 'loop', 0, -21)], 'ding': [('ding|tick', 'onset', 0, -15)],
    'rewind': [('rewind|whoosh_big|whoosh', 'onset', 0, -11)], 'suck': [('suck|riser', 'end', 0, -9)],
    'logo_hit': [('logo_hit|impact_big|impact', 'onset', 0, -3)],
}
BIG = ("impact_big", "drop", "logo_hit")
HITS = ("impact", "impact_big", "hit", "drop", "slash", "logo_hit", "click")


def decode(path, start=None, length=None):
    """Stereo float32 at SR; empty when ffmpeg cannot read the file."""
    cut = (["-ss", str(start)] if start is not None else []) + (["-t", f"{length:.4f}"] if length is not None else [])
    raw = subprocess.run(["ffmpeg", "-v", "error", *cut, "-i", path, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


class Kit:
    """Every file for a kit name (name.ext or name_N.ext), peak-normalized to -1 dBFS so levels mean something."""

    def __init__(self, folder):
        self.folder, self.cache = folder, {}

    def sounds(self, name):
        if name not in self.cache:
            xs = []
            for f in sorted(glob.glob(os.path.join(self.folder, name + "*"))):
                stem, ext = os.path.splitext(os.path.basename(f))
                variant = stem.startswith(name + "_") and stem[len(name) + 1 :].isdigit()
                if ext.lower() not in AUDIO or not (stem == name or variant):
                    continue
                x = decode(f)
                if len(x):
                    xs.append(x / (np.abs(x).max() or 1) * 10 ** (-1 / 20))
            self.cache[name] = xs
        return self.cache[name]

    def pick(self, names):
        return next((n for n in names.split("|") if self.sounds(n)), None)


def onset(x):
    return int(np.argmax(np.abs(x).max(1) > 0.2 * np.abs(x).max()))


def peak(x):
    return int(np.argmax(np.abs(x).max(1)))


def fade(x, n, up):
    n = min(n, len(x))
    if n:
        ramp = np.linspace(0, 1, n) if up else np.linspace(1, 0, n)
        if up:
            x[:n] *= ramp[:, None]
        else:
            x[-n:] *= ramp[:, None]
    return x


def place_effects(info, kit, n):
    """The effects track, how many cues of each name played, and the kit names that had no file."""
    levels = info.get("sounds") or {}
    sfx = np.zeros((n, 2), np.float32)
    count, missing = {}, set()

    def place(x, start, g):
        s = int(round(start * SR))
        lo, hi = max(0, s), min(n, s + len(x))
        if hi > lo:
            sfx[lo:hi] += x[lo - s : hi - s] * g

    for c in info["cues"]:
        name, t, gain = c["name"], c["t"], c.get("gain", 1)
        i = count.get(name, 0)
        count[name] = i + 1
        for names, align, off, db in MAP.get(name, [(name, "onset", 0, -8)]):
            if name in levels:
                db = levels[name]
            k = kit.pick(names)
            if not k:
                missing.add(names.split("|")[0])
                continue
            xs = kit.sounds(k)
            x, g = xs[i % len(xs)], gain * 10 ** (db / 20)
            if align == "loop":
                length = c.get("dur", 1)
                step = len(x) / SR if k == "tick_run" else 0.075
                q = 0
                while q * step < length:
                    place(x if k == "tick_run" else x[: int(step * SR * 1.5)], t + q * step, g)
                    q += 1
                continue
            if align == "end":
                start = c.get("end", t) - len(x) / SR
            elif align == "peak":
                start = t + off - peak(x) / SR
            else:
                start = t + off - onset(x) / SR
            if "dur" in c and align == "onset":
                x = fade(x[: int(c["dur"] * SR)].copy(), int(0.25 * SR), up=False)
            place(x, start, g)
    return sfx, count, missing


def music_bed(info, film, n):
    """The music from spec.music, cut dead on stopBeat or faded at the end; (track, problem or None)."""
    music = np.zeros((n, 2), np.float32)
    m = info.get("music") or {}
    if not m.get("file"):
        return music, None
    path = os.path.join(film, m["file"])
    beat = 60 / info["bpm"]
    stop = m.get("stopBeat")
    length = (stop * beat if stop else info["dur"]) + 0.03
    mus = decode(path, m.get("offset", 0), length) if os.path.exists(path) else np.zeros((0, 2), np.float32)
    if not len(mus):
        return music, f"no music: {path} is missing or unreadable"
    fade(mus, int(0.012 * SR), up=True)
    if stop:  # a hard stop on the logo downbeat
        mus = fade(mus[: int((stop * beat + 0.015) * SR)], int(0.02 * SR), up=False)
    else:
        fade(mus, int(1.2 * SR), up=False)
    music[: min(n, len(mus))] = mus[:n] * 10 ** (m.get("gain", -3.5) / 20)
    return music, None


def duck_curve(info, n):
    """Gain under the music: dips to 0.5 under the biggest hits, 0.62 under other hits, back in 0.35 s."""
    levels = info.get("sounds") or {}
    duck = np.ones(n, np.float32)
    for c in info["cues"]:
        if c["name"] in ("impact_big", "drop", "hit", "impact", "slash", "click", "logo_hit") or c["name"] in levels:
            s = int(c["t"] * SR)
            depth = 0.5 if c["name"] in BIG else 0.62
            env = np.concatenate([np.linspace(1, depth, int(0.03 * SR)), np.linspace(depth, 1, int(0.35 * SR))])
            seg = duck[s : s + len(env)]
            duck[s : s + len(env)] = np.minimum(seg, env[: len(seg)])
    return duck


def rms_db(x):
    return 20 * np.log10(np.sqrt((x**2).mean()) + 1e-9)


def build_mix(info, film, kit_dir, use_music=True):
    """(stereo mix before loudness normalization, report) for the film's cue list."""
    n = int((info["dur"] + 0.6) * SR)
    sfx, count, missing = place_effects(info, Kit(kit_dir), n)
    music, problem = music_bed(info, film, n) if use_music else (np.zeros((n, 2), np.float32), None)
    duck = duck_curve(info, n)
    bed = music * duck[:, None]
    mix = (bed + sfx) * 10 ** (-6 / 20)
    levels = info.get("sounds") or {}
    weak = []
    for c in info["cues"]:
        if c["name"] in HITS or c["name"] in levels:
            s0 = int(c["t"] * SR)
            s1 = s0 + int(0.15 * SR)
            d = rms_db(sfx[s0:s1]) - rms_db(bed[s0:s1])
            if d < 0:
                weak.append(f"{c['name']}@{c['t']:.2f}s {d:+.1f} dB")
    return mix, {"cues": sum(count.values()), "count": count, "missing": sorted(missing), "weak": weak, "music": problem}


def write_wav(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def loudnorm(src, out, lufs, dur):
    """Two-pass ffmpeg loudnorm of src into out, cut to dur seconds."""
    target = f"loudnorm=I={lufs}:TP=-1:LRA=11"
    r = subprocess.run(["ffmpeg", "-v", "info", "-i", src, "-af", f"{target}:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    js = json.loads(r[r.rindex("{") : r.rindex("}") + 1])
    measured = f"measured_I={js['input_i']}:measured_TP={js['input_tp']}:measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}"
    af = f"{target}:{measured}:offset={js['target_offset']}:linear=true"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", af, "-ar", str(SR), "-t", f"{dur:.4f}", out], check=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("film")
    ap.add_argument("--out", help="default: <film>/out/mix.wav")
    ap.add_argument("--lufs", type=float, default=-14)
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--kit", help="the sound folder (default: <film>/audio/sfx)")
    ap.add_argument("--info", help="film metadata JSON from info.mjs, instead of asking the film")
    a = ap.parse_args(argv)
    info = film_info(a.film, a.info)
    kit = a.kit or os.path.join(a.film, "audio", "sfx")
    out = a.out or os.path.join(a.film, "out", "mix.wav")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    mix, report = build_mix(info, a.film, kit, not a.no_music)
    if report["music"]:
        print(report["music"])
    if not np.abs(mix).max():
        sys.exit(f"nothing to mix: no music and no sound files for the film's cues in {kit}")
    tmp = out + ".raw.wav"
    write_wav(tmp, mix)
    try:
        loudnorm(tmp, out, a.lufs, info["dur"])
    finally:
        os.remove(tmp)
    print(f"{out}: {report['cues']} cues, loudness target {a.lufs} LUFS")
    if report["missing"]:
        print("no file for these sounds (their cues are silent):", ", ".join(report["missing"]))
    if report["weak"]:
        print("hits quieter than the music (raise them in spec.sounds or lower music.gain):", "; ".join(report["weak"][:12]))


if __name__ == "__main__":
    main()
