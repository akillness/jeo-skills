#!/usr/bin/env python3
"""Check a composed master against the cue sheet of its sound pass and against its simulation.

Usage: python3 check_master.py master.mp4 cues.json [--sim sim.wav] [-o OUTDIR] [--sections 0 5 11]

cues.json is the file `build_passes.py sound` writes; sim.wav is what `build_passes.py simulate`
wrote from the same plan. Needs numpy and ffmpeg, not Pillow. Prints:
- the ffprobe summary, against the planned length and canvas;
- integrated loudness and true peak (ffmpeg ebur128=peak=true);
- the mean (RMS) and max level of each section (cues.json "sections", or --sections);
- with --sim: how closely the master follows the simulation, overall, per 0.5 s window, and in
  each hit's window;
- an onset table: where each hit landed in the master against its planned time;
- any frame, or pair of frames, under half the level of the frames on both sides when both sit at
  mean gray level 24 or more: a layer that ended a frame early, a black frame at a cut. A fade, or a
  dip inside a dim shot, passes.
Writes OUTDIR/sheet_2fps.jpg (a 2 fps contact sheet, for timing only: judge game logic on
full-resolution frames), OUTDIR/onsets.json and, with --sim, OUTDIR/sim.json. OUTDIR defaults to
check_<master name> beside cues.json, the build folder, so nothing lands beside a delivered master.

Compose plays the platform's 128 kbps mp3 copy of each upload, which removes everything above
16 kHz, so the master, the simulation and every hit are low-passed at 16 kHz before matching.

--sim (use it whenever the simulation exists): the master is aligned on the simulation within
0.1 s, and levels are compared after their overall gain difference, which a loudness pass changes.
It passes with:
- an overall correlation of 0.95 or more;
- every 0.5 s window with sound correlating 0.7 or more, within 2 dB;
- each hit's window, from 20 ms before the hit to 0.25 s after (to its end when shorter, at least
  0.1 s), found within 5 ms of its place, correlating 0.75 or more, within 2 dB;
- each hit's "miss" at 1 or under: in the 100 ms from the hit, the master's error to the simulation
  over its error to the simulation without that hit (rendered from cues.json). Over 1, the master
  is closer to a mix without the hit: missing, moved or much quieter. No miss is shown for a hit too
  quiet to tell from codec noise.
A hit masked by other sounds, a ramping or noise-like sound, or a repeat of the same sound passes
when the master follows the simulation in its window: the onset table is then information only.
Four accepted masters measured 0.984 to 0.994 overall, 0.85 or more per hit window, within 1.1 dB,
with every miss under 0.86.

Onset table: each hit is found by cross-correlating the master with the hit's own sound, read from
its trimStart. The search runs from 0.15 s before to 0.35 s after the planned time, but never past
halfway to a repeat of the same sound, so a hit repeated within 0.35 s is not matched to its
neighbor. A hit more than 0.1 s off, or matching under 0.3, reads CHECK. Without --sim, a masked,
ramping or repeated hit can read CHECK while on time.

Exit status 1 when the file's length or canvas differs from the plan, the true peak is over
-1 dBTP, the loudness is outside -16 to -14 LUFS, a frame reads dark, or, with --sim, the master
departs from the simulation; without --sim, when a hit reads CHECK.
"""

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

import numpy as np

import build_passes as bp

SR = bp.SR
PRE, POST, REF = 0.15, 0.35, 0.25
SIM_ALL, SIM_WINDOW, SIM_HIT, SIM_DB, SIM_OFFSET = 0.95, 0.7, 0.75, 2.0, 0.005
DARK_FLOOR = 24  # mean gray level the frames around a dip need, so a dark scene never reads as one


PROBE_ENTRIES = "stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,sample_rate,channels:format=duration"


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", PROBE_ENTRIES, "-of", "json", str(path)],
                         capture_output=True, text=True, check=True)
    info = json.loads(out.stdout)
    return info.get("streams", []), float(info["format"]["duration"])


def mono(path):
    return bp.load_audio(path, low=True).mean(axis=1)


def rms_db(x):
    return bp.db(float(np.sqrt(np.mean(np.asarray(x, np.float64) ** 2)))) if len(x) else float("-inf")


def levels(x, start, end):
    seg = x[round(start * SR):round(end * SR)]
    if not seg.size:
        return float("-inf"), float("-inf")
    return rms_db(seg), bp.db(float(np.abs(seg).max()))


def search_windows(hits):
    """Lag range per hit, cut halfway to the nearest repeat of the same sound on either side."""
    windows = []
    for h in hits:
        same = [o["t"] for o in hits if o is not h and (o["file"], o.get("trimStart", 0)) == (h["file"], h.get("trimStart", 0))]
        before = [h["t"] - t for t in same if t < h["t"]]
        after = [t - h["t"] for t in same if t > h["t"]]
        windows.append((-min([PRE] + [d / 2 for d in before]), min([POST] + [d / 2 for d in after])))
    return windows


def onset(render, ref, t, lo, hi):
    """Offset (s) of the best match of ref in render for lags lo..hi around t, and its score."""
    a = max(0, round((t + lo) * SR))
    seg = render[a:round((t + hi) * SR) + len(ref)].astype(np.float64)
    ref = ref.astype(np.float64)
    if len(seg) < len(ref) or not ref.any():
        return None, 0.0
    nf = 1 << (len(seg) + len(ref) - 1).bit_length()
    xc = np.fft.irfft(np.fft.rfft(seg, nf) * np.conj(np.fft.rfft(ref, nf)), nf)[:len(seg) - len(ref) + 1]
    energy = np.concatenate([[0.0], np.cumsum(seg ** 2)])
    energy = np.sqrt(np.maximum(energy[len(ref):] - energy[:-len(ref)], 0))
    score = xc / (energy * np.linalg.norm(ref) + 1e-12)
    k = int(score.argmax())
    return (a + k) / SR - t, float(score[k])


def onset_table(render, hits):
    rows = []
    for h, (lo, hi) in zip(hits, search_windows(hits)):
        trim = h.get("trimStart", 0)
        ref = mono(h["file"])[round(trim * SR):round((trim + min(REF, h.get("end", h["t"] + REF) - h["t"])) * SR)]
        off, score = onset(render, ref, h["t"], lo, hi)
        rows.append({"label": h["label"], "t": h["t"], "offset": off, "score": score,
                     "check": off is None or abs(off) > 0.1 or score < 0.3})
    return rows


def correlation(a, b):
    a, b = np.asarray(a, np.float64), np.asarray(b, np.float64)
    d = math.sqrt(float(a @ a) * float(b @ b))
    return float(a @ b) / d if d > 0 else 0.0


def align(master, sim, max_lag=0.1):
    """Samples the master runs late on the simulation (negative: early), within max_lag seconds."""
    n = min(len(master), len(sim))
    nf = 1 << (2 * n - 1).bit_length()
    xc = np.fft.irfft(np.fft.rfft(master[:n], nf) * np.conj(np.fft.rfft(sim[:n], nf)), nf)
    m = round(max_lag * SR)
    lags = np.r_[0:m + 1, -m:0]
    return int(lags[int(np.argmax(np.r_[xc[:m + 1], xc[-m:]]))])


def missing_ratio(m, s, h, gain):
    """In the 100 ms from a hit: the master's error to the simulation over its error to the simulation without the hit.

    Under 1 the master holds the hit as planned; over 1 it is closer to a mix without it (missing, moved,
    or much quieter). None when the hit carries under a quarter of the error, below what codec noise allows.
    """
    p, n = round(h["t"] * SR), min(len(m), len(s))
    b = min(n, p + round(0.1 * SR))
    if b <= p:
        return None
    x = mono(h["file"])[round(h.get("trimStart", 0) * SR):]
    own = np.zeros(b - p)
    seg = x[:min(b - p, round((h.get("end", h["t"] + 0.1) - h["t"]) * SR))] * h.get("volume", 1.0) * gain
    own[:len(seg)] = seg
    err = m[p:b].astype(np.float64) - gain * s[p:b]
    with_hit, without = float(err @ err), float((err + own) @ (err + own))
    if float(own @ own) < 0.25 * with_hit or without <= 0:
        return None
    return with_hit / without


def compare(master, sim, hits):
    """The master against the simulation: an overall summary, the 0.5 s windows, and one row per hit."""
    lag = align(master, sim)
    n = min(len(master), len(sim))
    m = np.zeros(n, np.float32)
    if lag >= 0:
        m[:max(0, n - lag)] = master[lag:n]
    else:
        m[-lag:] = master[:n + lag]
    s = sim[:n]
    gain = rms_db(m) - rms_db(s)
    windows = []
    for k in range(0, n, SR // 2):
        a, b = m[k:k + SR // 2], s[k:k + SR // 2]
        if len(b) >= SR // 10 and rms_db(b) > -50:
            match, level = correlation(a, b), rms_db(a) - rms_db(b) - gain
            windows.append({"t": k / SR, "match": round(match, 4), "level_db": round(level, 2),
                            "ok": match >= SIM_WINDOW and abs(level) <= SIM_DB})
    rows = []
    for h in hits:
        t = h["t"]
        a = max(0, round((t - 0.02) * SR))
        b = min(n, round(max(min(h.get("end", t + 0.25), t + 0.25), t + 0.1) * SR))
        row = {"label": h["label"], "t": t, "sim_offset": None, "sim_match": None, "sim_level_db": None, "sim_miss": None,
               "sim_ok": True}
        if b - a > SR // 100 and rms_db(s[a:b]) > -60:
            off, match = onset(m, s[a:b], a / SR, -0.02, 0.02)
            k = a + round(off * SR)
            level = rms_db(m[k:k + b - a]) - rms_db(s[a:b]) - gain
            miss = missing_ratio(m, s, h, 10 ** (gain / 20)) if "file" in h else None
            row.update({"sim_offset": off, "sim_match": round(match, 4), "sim_level_db": round(level, 2),
                        "sim_miss": None if miss is None else round(miss, 3),
                        "sim_ok": abs(off) <= SIM_OFFSET and match >= SIM_HIT and abs(level) <= SIM_DB
                        and (miss is None or miss <= 1)})
        rows.append(row)
    summary = {"lag_ms": round(1000 * lag / SR, 2), "match": round(correlation(m, s), 4), "gain_db": round(gain, 2),
               "windows": windows}
    return summary, rows


def dark_frames(master):
    """(first frame, run of 1 or 2, its level, level before, level after) for each short dip."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(master), "-vf", "scale=32:56:flags=area,format=gray",
                          "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    levels = np.frombuffer(raw, np.uint8).reshape(-1, 32 * 56).mean(axis=1)
    found, n = [], 1
    while n < len(levels) - 1:
        for run in (1, 2):
            if n + run < len(levels):
                around = min(levels[n - 1], levels[n + run])
                if around >= DARK_FLOOR and levels[n:n + run].max() < around / 2:
                    found.append((n, run, float(levels[n:n + run].max()), float(levels[n - 1]), float(levels[n + run])))
                    n += run
                    break
        else:
            n += 1
    return found


def contact_sheet(master, out, duration):
    rows = math.ceil((int(duration * 2) + 1) / 10)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(master), "-vf", f"fps=2,scale=216:-2,tile=10x{rows}",
                    "-frames:v", "1", str(out)], check=True)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("master", type=Path)
    ap.add_argument("cues", type=Path)
    ap.add_argument("--sim", type=Path, help="the wav build_passes.py simulate wrote from the same plan")
    ap.add_argument("-o", "--out", type=Path, help="default: check_<master name> beside cues.json")
    ap.add_argument("--sections", type=float, nargs="+", help="section start times in seconds")
    args = ap.parse_args(argv)
    plan = json.loads(args.cues.read_text())
    out = args.out or args.cues.parent / f"check_{args.master.stem}"
    out.mkdir(parents=True, exist_ok=True)
    failed = []

    streams, duration = probe(args.master)
    if not any(s["codec_type"] == "video" for s in streams):
        failed.append("no video stream")
    for s in streams:
        if s["codec_type"] == "video":
            print(f"video: {s['codec_name']} {s['width']}x{s['height']} {s.get('pix_fmt', '')} {s['r_frame_rate']} fps")
            if plan.get("canvas") and [s["width"], s["height"]] != plan["canvas"]:
                failed.append(f"canvas {s['width']}x{s['height']}, planned {plan['canvas'][0]}x{plan['canvas'][1]}")
        elif s["codec_type"] == "audio":
            print(f"audio: {s['codec_name']} {s.get('sample_rate')} Hz, {s.get('channels')} channels")
    print(f"duration: {duration:.3f} s")
    if "duration" in plan and abs(duration - plan["duration"]) > 1 / plan.get("fps", 30):
        failed.append(f"length {duration:.3f} s, planned {plan['duration']} s")
    if not any(s["codec_type"] == "audio" for s in streams):
        failed.append("no audio stream")
        lufs = None
    else:
        lufs, tp = bp.loudness(args.master)
        print(f"loudness: {lufs:.1f} LUFS integrated, true peak {tp:+.1f} dBTP")
        if tp > -1:
            failed.append(f"true peak {tp:+.1f} dBTP, over -1")
        if not -16 <= lufs <= -14:
            failed.append(f"{lufs:.1f} LUFS, outside -16 to -14: run the loudness pass")

    rows = []
    if lufs is not None:
        render = mono(args.master)
        starts = args.sections or plan.get("sections") or [0]
        for a, b in zip(starts, list(starts[1:]) + [duration]):
            mean, peak = levels(render, a, b)
            print(f"section {a:g}-{b:g} s: mean {mean:.1f} dB, max {peak:.1f} dB")
        hits = [c for c in plan["cues"] if c.get("role", "hit") == "hit"]
        rows = onset_table(render, hits)
        sim = None
        if args.sim:
            summary, sim = compare(render, mono(args.sim), hits)
            bad = [w for w in summary["windows"] if not w["ok"]]
            low = min(summary["windows"], key=lambda w: w["match"], default=None)
            print(f"simulation: master {summary['lag_ms']:+.1f} ms on it, overall match {summary['match']:.3f}, gain "
                  f"{summary['gain_db']:+.2f} dB" + (f"; lowest 0.5 s window {low['match']:.3f} at {low['t']:g} s" if low else ""))
            if summary["match"] < SIM_ALL:
                failed.append(f"the master follows the simulation at {summary['match']:.3f} overall, under {SIM_ALL}: "
                              "compare the payload with the plan")
            failed += [f"the master departs from the simulation at {w['t']:g} s: match {w['match']:.2f}, "
                       f"level {w['level_db']:+.1f} dB" for w in bad]
            (out / "sim.json").write_text(json.dumps(summary, indent=1) + "\n")
            for r, s in zip(rows, sim):
                r.update({k: v for k, v in s.items() if k.startswith("sim_")})
        for r in rows:
            landed = "no match" if r["offset"] is None else f"{r['offset'] * 1000:+6.1f} ms"
            line = f"  {r['t']:7.3f} s  {r['label']:24s} lands {landed}  match {r['score']:.2f}"
            if sim is None:
                line += "  CHECK" if r["check"] else ""
            elif r["sim_match"] is None:
                line += "  sim: silent there"
            else:
                miss = "" if r["sim_miss"] is None else f", miss {r['sim_miss']:.2f}"
                line += (f"  sim {r['sim_offset'] * 1000:+5.1f} ms, match {r['sim_match']:.2f}, {r['sim_level_db']:+5.1f} dB"
                         f"{miss}{'' if r['sim_ok'] else '  DEPARTS'}")
            print(line)
        if sim is None:
            failed += [f"hit {r['label']} at {r['t']} s" for r in rows if r["check"]]
        else:
            failed += [f"hit {r['label']} at {r['t']} s departs from the simulation" for r in rows if not r["sim_ok"]]

    fps = plan.get("fps", 30)
    dips = dark_frames(args.master)
    for n, run, level, before, after in dips:
        frames = f"frame {n}" if run == 1 else f"frames {n}-{n + 1}"
        failed.append(f"{frames} ({n / fps:.3f} s) dips dark: level {level:.0f} against {before:.0f} and {after:.0f}; "
                      "check them at full size")
    print(f"picture: {len(dips)} dark frame dip{'' if len(dips) == 1 else 's'}")
    contact_sheet(args.master, out / "sheet_2fps.jpg", duration)
    (out / "onsets.json").write_text(json.dumps(rows, indent=1) + "\n")
    print(f"wrote {out / 'sheet_2fps.jpg'} and {out / 'onsets.json'}")
    for f in failed:
        print(f"FAIL {f}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
