#!/usr/bin/env python3
"""mix.py - mix VO + music + SFX into one loudness-normalised 48 kHz stereo wav with ffmpeg. stdlib only.

Usage:
  python3 mix.py --duration 15 --out mix.wav
      [--vo vo.mp3@0.4]                 clip@start_seconds, REPEATABLE (one --vo per line clip, e.g. from `voice.py split`:
                                        --vo audio/vo/line01.wav@0.00 --vo audio/vo/line02.wav@1.80 ...; speech starts `lead`
                                        seconds into a clip, so use @(beat_time - lead))    [--vo-gain 0]
      [--music music.mp3 | music.mp3@1.0] [--music-gain -18] [--loop-music]
      [--sfx sfx/whoosh.mp3@2.10:-8 ...] clip@time:gain_dB (repeatable)
      [--events events.json]            [{"t":2.1,"sfx":"path","gain":-8}, ...] (relative paths: cwd first, then the json's folder)
      [--duck] [--duck-db 9] [--duck-attack 0.08] [--duck-release 0.3]
                                        duck the music under the VO by a PREDICTABLE amount: a gain envelope built from the VO's
                                        speech regions (ffmpeg silencedetect -40 dB, d 0.08, per clip, offset by its @t): music is
                                        --duck-db dB down (default 9) while a line is spoken, the ramp-in (--duck-attack, default 80 ms)
                                        finishes at the speech onset, the ramp-out (--duck-release, default 300 ms) starts at the
                                        speech offset, so the music returns in the gaps. --duck-db alone also switches ducking on.
                                        The log reports the measured music RMS in VO regions vs gaps (should differ by ~--duck-db +-2).
      [--lufs -14] [--tp -1] [--no-normalize]

Music is trimmed to --duration with a fade-OUT over the last 1.0 s only (no fade-in).
Loudness: two-pass loudnorm to -14 LUFS integrated / -1 dBTP (linear), then a measurement of the result is printed.
Exit: 0 ok, 1 failure, 2 bad usage.
"""
from __future__ import annotations
import argparse, array, json, math, os, re, shutil, subprocess, sys, tempfile, wave


def die(msg, code=1):
    print("error: " + msg, file=sys.stderr)
    sys.exit(code)


def split_at(spec):
    """'path@1.5' -> (path, 1.5); no '@number' -> (path, 0.0)"""
    m = re.match(r"^(.*)@(-?\d+(?:\.\d+)?)$", spec)
    return (m.group(1), float(m.group(2))) if m else (spec, 0.0)


def parse_sfx(spec):
    m = re.match(r"^(.*?)@(\d+(?:\.\d+)?)(?::(-?\d+(?:\.\d+)?))?$", spec)
    if not m:
        die("bad --sfx '%s' (want path@time[:gain_dB])" % spec, 2)
    return m.group(1), float(m.group(2)), float(m.group(3) or 0)


def need(p):
    if not os.path.isfile(p):
        die("file not found: " + p, 2)
    return p


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def speech_regions(path, noise_db=-40, d=0.08, edge_d=0.01):
    """[(onset, offset)] of audible speech in a clip (silencedetect; the clip's own lead/tail silence counts from edge_d)."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "silencedetect=n=%sdB:d=%s" % (noise_db, edge_d), "-f", "null", "-"], capture_output=True, text=True)
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", r.stderr)
    dur = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0.0
    sil, cur = [], None
    for m in re.finditer(r"silence_(start|end): (-?[\d.]+)", r.stderr):
        v = max(0.0, float(m.group(2)))
        if m.group(1) == "start":
            cur = v
        elif cur is not None:
            sil.append((cur, v)); cur = None
    if cur is not None:
        sil.append((cur, dur))
    regs, t = [], 0.0
    for s0, e0 in sil:
        if s0 <= 0.001 or e0 >= dur - 0.001 or e0 - s0 >= d:
            if s0 - t > 0.02:
                regs.append((t, s0))
            t = max(t, e0)
    if dur - t > 0.02:
        regs.append((t, dur))
    return regs


def merge_regions(regs):
    out = []
    for s0, e0 in sorted(regs):
        if out and s0 <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e0))
        else:
            out.append((s0, e0))
    return out


def duck_envelope(regs, D, attack, release, sr=48000):
    """e(t) in [0,1] per sample: 1 inside speech, linear ramp-in over `attack` ending at the onset, ramp-out over `release` after the offset."""
    n = int(round(D * sr))
    e = [0.0] * n
    for a0, b0 in regs:
        i0, i1 = int(a0 * sr), int(b0 * sr)
        for i in range(max(0, i0 - int(attack * sr)), min(n, i0)):
            v = (i - (i0 - attack * sr)) / (attack * sr) if attack > 0 else 1.0
            if v > e[i]:
                e[i] = v
        for i in range(max(0, i0), min(n, i1)):
            e[i] = 1.0
        for i in range(max(0, i1), min(n, i1 + int(release * sr))):
            v = 1.0 - (i - i1) / (release * sr)
            if v > e[i]:
                e[i] = v
    return e


def write_gain_wav(path, e, depth_db, sr=48000):
    k = depth_db
    g = array.array("h")
    for v in e:                       # stereo (L=R): a mono wav would be up-mixed at -3 dB and shift the whole duck
        x = int(round(32767 * 10 ** (-k * v / 20.0)))
        g.append(x); g.append(x)
    if sys.byteorder == "big":
        g.byteswap()
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(g.tobytes())


def rms_windows(cmd_prefix, graph, win=0.05):
    n = int(48000 * win)
    r = subprocess.run(cmd_prefix + ["-filter_complex", graph + ";[x]aformat=channel_layouts=mono,asetnsamples=n=%d:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-[y]" % n,
                                     "-map", "[y]", "-f", "null", "-"], capture_output=True, text=True)
    return [10 ** (float(v) / 20) if v not in ("-inf", "nan") else 0.0 for v in re.findall(r"RMS_level=(-?[\d.]+|-inf|nan)", r.stdout)], r


def db(p):
    return 20 * math.log10(max(p, 1e-9))


def measure_duck(a, duck, D):
    """Render the music bus with and without the duck, compare 50 ms RMS windows inside VO speech (envelope = 1) and in gaps (envelope = 0)."""
    try:
        base = ["ffmpeg", "-hide_banner", "-nostats", "-y"] + (["-stream_loop", "-1"] if duck["loop"] else []) + ["-i", duck["music"]]
        fmt = "aformat=sample_rates=48000:channel_layouts=stereo:sample_fmts=fltp"
        un, _ = rms_windows(base, duck["chain"](0, "m") + ";[m]anull[x]")
        du, _ = rms_windows(base + ["-i", duck["wav"]], duck["chain"](0, "m") + ";[1:a]%s[env];[m][env]amultiply[x]" % fmt)
        n = min(len(un), len(du))
        e, W = duck["env"], 0.05
        reg_i, gap_i = [], []
        for i in range(n):
            seg = e[int(i * W * 48000):int((i + 1) * W * 48000)]
            if not seg:
                continue
            if min(seg) >= 0.999:
                reg_i.append(i)
            elif max(seg) <= 0.001 and (i + 1) * W < D - 1.0:     # not inside the music's final 1 s fade-out
                gap_i.append(i)
        if len(reg_i) < 2 or len(gap_i) < 2:
            return "duck: depth %.1f dB, %d VO regions; measurement n/a (not enough speech/gap windows)" % (a.duck_db, len(duck["regs"]))
        pw = lambda arr, idx: db((sum(arr[i] ** 2 for i in idx) / len(idx)) ** 0.5)
        rd, gd, ru, gu = pw(du, reg_i), pw(du, gap_i), pw(un, reg_i), pw(un, gap_i)
        att_r, att_g = ru - rd, gu - gd
        diff = gd - rd
        gain_only = att_r - att_g
        verdict = "OK" if abs(gain_only - a.duck_db) <= 2.0 else "OFF TARGET"
        return ("duck: %d VO regions, attack %.0f ms, release %.0f ms, depth %.1f dB.  music RMS in VO regions %.1f dBFS vs gaps %.1f dBFS -> differ by %.1f dB "
                "(music's own region/gap difference without ducking %.1f dB; gain attenuation in speech %.1f dB, in gaps %.1f dB => %.1f dB vs target %.1f +-2: %s)" % (
                    len(duck["regs"]), a.duck_attack * 1000, a.duck_release * 1000, a.duck_db, rd, gd, diff, gu - ru, att_r, att_g, gain_only, a.duck_db, verdict))
    finally:
        shutil.rmtree(duck["tmp"], ignore_errors=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--duration", type=float, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--vo", action="append", default=[])
    ap.add_argument("--vo-gain", type=float, default=0.0)
    ap.add_argument("--music")
    ap.add_argument("--music-gain", type=float, default=-18.0)
    ap.add_argument("--loop-music", action="store_true")
    ap.add_argument("--sfx", action="append", default=[])
    ap.add_argument("--events")
    ap.add_argument("--duck", action="store_true")
    ap.add_argument("--duck-db", type=float, default=None)
    ap.add_argument("--duck-attack", type=float, default=0.08)
    ap.add_argument("--duck-release", type=float, default=0.30)
    ap.add_argument("--lufs", type=float, default=-14.0)
    ap.add_argument("--tp", type=float, default=-1.0)
    ap.add_argument("--no-normalize", action="store_true")
    a = ap.parse_args()
    if a.duration <= 0:
        die("--duration must be > 0", 2)
    if not shutil.which("ffmpeg"):
        die("ffmpeg not found")

    sfx = [parse_sfx(s) for s in a.sfx]
    if a.events:
        base = os.path.dirname(os.path.abspath(a.events))
        for e in json.load(open(need(a.events))):
            sp = e.get("sfx")
            if not sp:
                continue
            if not os.path.isfile(sp) and os.path.isfile(os.path.join(base, sp)):
                sp = os.path.join(base, sp)
            sfx.append((sp, float(e["t"]), float(e.get("gain", 0))))
    for p, t, _ in sfx:
        if t >= a.duration:
            print("warn: sfx %s at %.2fs is past the end (%.2fs): skipped" % (p, t, a.duration), file=sys.stderr)
    if a.duck_db is not None:
        a.duck = True
    if a.duck_db is None:
        a.duck_db = 9.0
    if a.duck_db < 0 or a.duck_attack < 0 or a.duck_release < 0:
        die("--duck-db/--duck-attack/--duck-release must be >= 0", 2)
    if a.duck and not (a.vo and a.music):
        print("warn: --duck needs both --vo and --music; ignored", file=sys.stderr)
    return build(a, a.duration, sfx)


def build(a, D, sfx):
    # every use of a clip gets its own -i input (a stream can feed only one filter chain)
    inputs, chains, mix_labels = [], [], []
    FMT = "aformat=sample_rates=48000:channel_layouts=stereo:sample_fmts=fltp"
    n_in = [0]

    def add_input(path, loop=False):
        inputs.extend((["-stream_loop", "-1"] if loop else []) + ["-i", need(path)])
        n_in[0] += 1
        return n_in[0] - 1

    def src(idx, t, gain, label, trim=None):
        f = "[%d:a]%s" % (idx, FMT)
        if trim:
            f += ",atrim=0:%.3f,asetpts=PTS-STARTPTS" % trim
        if t > 0:
            f += ",adelay=%d:all=1" % round(t * 1000)
        chains.append(f + ",volume=%sdB[%s]" % (gain, label))

    vo_labels = []
    for k, spec in enumerate(a.vo):
        p, t = split_at(spec)
        src(add_input(p), t, a.vo_gain, "vo%d" % k)
        vo_labels.append("vo%d" % k)
    vo_bus = None
    if vo_labels:
        if len(vo_labels) == 1:
            vo_bus = vo_labels[0]
        else:
            chains.append("%samix=inputs=%d:normalize=0:duration=longest[vobus]" % ("".join("[%s]" % l for l in vo_labels), len(vo_labels)))
            vo_bus = "vobus"
    duck = None
    if a.music:
        p, t = split_at(a.music)
        mus_path = need(p)

        def music_chain(i, label, t=t):
            f = "[%d:a]%s,atrim=0:%.3f,asetpts=PTS-STARTPTS,afade=t=out:st=%.3f:d=1.0" % (i, FMT, max(0.1, D - t), max(0.0, D - t - 1.0))
            if t > 0:
                f += ",adelay=%d:all=1" % round(t * 1000)
            return f + ",volume=%sdB[%s]" % (a.music_gain, label)
        i = add_input(mus_path, a.loop_music)
        if a.duck and vo_bus:
            regs = []
            for spec in a.vo:
                vp, vt = split_at(spec)
                regs += [(s0 + vt, e0 + vt) for s0, e0 in speech_regions(need(vp))]
            regs = merge_regions([(s0, min(e0, D)) for s0, e0 in regs if s0 < D])
            if not regs:
                print("warn: --duck found no speech in the VO clips; music not ducked", file=sys.stderr)
        else:
            regs = []
        if regs:
            env = duck_envelope(regs, D, a.duck_attack, a.duck_release)
            tmpdir = tempfile.mkdtemp(prefix="mixduck-")
            env_wav = os.path.join(tmpdir, "gain.wav")
            write_gain_wav(env_wav, env, a.duck_db)
            duck = {"regs": regs, "env": env, "wav": env_wav, "tmp": tmpdir, "chain": music_chain, "music": mus_path, "loop": a.loop_music}
            chains.append(music_chain(i, "mus0"))
            ei = add_input(env_wav)
            chains.append("[%d:a]aformat=sample_rates=48000:channel_layouts=stereo:sample_fmts=fltp[env]" % ei)
            chains.append("[mus0][env]amultiply[musd]")
            mix_labels.append("musd")
        else:
            chains.append(music_chain(i, "mus"))
            mix_labels.append("mus")
    if vo_bus:
        mix_labels.append(vo_bus)
    for k, (p, t, g) in enumerate(sfx):
        if t >= D:
            continue
        src(add_input(p), t, g, "sfx%d" % k)
        mix_labels.append("sfx%d" % k)
    if not mix_labels:
        die("nothing to mix: give --vo, --music, --sfx or --events", 2)

    if len(mix_labels) > 1:
        chains.append("%samix=inputs=%d:normalize=0:duration=longest:dropout_transition=0[pre0]" % ("".join("[%s]" % l for l in mix_labels), len(mix_labels)))
    else:
        chains.append("[%s]anull[pre0]" % mix_labels[0])
    chains.append("[pre0]apad=whole_dur=%.3f,atrim=0:%.3f,asetpts=PTS-STARTPTS[pre]" % (D, D))
    pre = ";".join(chains)

    def ff(graph_tail, out_args):
        return ["ffmpeg", "-y", "-hide_banner", "-nostats"] + inputs + ["-filter_complex", pre + ";" + graph_tail] + out_args

    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    final = "aresample=48000,aformat=sample_fmts=s16:channel_layouts=stereo:sample_rates=48000"
    if a.no_normalize:
        r = run(ff("[pre]%s[out]" % final, ["-map", "[out]", "-c:a", "pcm_s16le", a.out]))
    else:
        m1 = run(ff("[pre]loudnorm=I=%s:TP=%s:LRA=11:print_format=json[o]" % (a.lufs, a.tp), ["-map", "[o]", "-f", "null", "-"]))
        if m1.returncode:
            die("ffmpeg (measure pass) failed:\n" + m1.stderr[-1200:])
        js = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", m1.stderr, re.S)
        meas = json.loads(js.group(0)) if js else None
        if not meas or meas["input_i"] in ("-inf", "inf") or float(meas["input_i"]) < -70:
            print("warn: mix is (near) silent - skipping loudness normalisation", file=sys.stderr)
            tail = "[pre]%s[out]" % final
        else:
            ln = "loudnorm=I=%s:TP=%s:LRA=11:measured_I=%s:measured_TP=%s:measured_LRA=%s:measured_thresh=%s:offset=%s:linear=true" % (
                a.lufs, a.tp, meas["input_i"], meas["input_tp"], meas["input_lra"], meas["input_thresh"], meas["target_offset"])
            tail = "[pre]%s,%s[out]" % (ln, final)
        r = run(ff(tail, ["-map", "[out]", "-c:a", "pcm_s16le", a.out]))
    if r.returncode:
        if duck:
            shutil.rmtree(duck["tmp"], ignore_errors=True)
        die("ffmpeg failed:\n" + r.stderr[-1500:])
    duck_log = measure_duck(a, duck, D) if duck else None
    v = run(["ffmpeg", "-hide_banner", "-nostats", "-i", a.out, "-af", "ebur128=peak=true", "-f", "null", "-"])
    mi = re.findall(r"I:\s+(-?[\d.]+) LUFS", v.stderr)
    mp = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", v.stderr)
    d = run(["ffprobe", "-v", "error", "-show_entries", "stream=sample_rate,channels:format=duration", "-of", "default=nw=1", a.out]).stdout.split()
    print("%s  %s  integrated=%s LUFS  true-peak=%s dBFS  (%d inputs, %d sfx)" % (a.out, " ".join(d), mi[-1] if mi else "?", mp[-1] if mp else "?", sum(1 for x in inputs if x == "-i") - (1 if duck else 0), len(sfx)))
    if duck_log:
        print(duck_log)


if __name__ == "__main__":
    main()
