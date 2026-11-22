"""Gate a delivered video before handing it over: H.264 4:2:0 at a level players decode, the frame count, a clean
decode, an audio track, faststart and the size. Prints PASS/FAIL per check (WARN never fails) and exits 1 on any FAIL.
usage: python tools/delivery_check.py <video.mp4> [--frames N] [--max-mb MB] [--no-audio]"""
import argparse
import json
import struct
import subprocess
import sys
from pathlib import Path

# H.264 Table A-1 by level_idc: max macroblocks per second, per frame, and MaxBR in kb/s (Main; High allows 1.25x)
LEVELS = {10: (1485, 99, 64), 11: (3000, 396, 192), 12: (6000, 396, 384), 13: (11880, 396, 768),
          20: (11880, 396, 2000), 21: (19800, 792, 4000), 22: (20250, 1620, 4000), 30: (40500, 1620, 10000),
          31: (108000, 3600, 14000), 32: (216000, 5120, 20000), 40: (245760, 8192, 20000), 41: (245760, 8192, 50000),
          42: (522240, 8704, 50000), 50: (589824, 22080, 135000), 51: (983040, 36864, 240000),
          52: (2073600, 36864, 240000), 60: (4177920, 139264, 240000), 61: (8355840, 139264, 480000),
          62: (16711680, 139264, 800000)}
MAX_BR = {k: v[2] for k, v in LEVELS.items()}


def mbs(w, h):
    return -(-w // 16) * -(-h // 16)


def level_cap(w, h):
    """Highest level_idc the deliverable may signal: 4.2 up to 1080p-sized frames, 5.2 (4K60) above."""
    return 42 if mbs(w, h) <= 8704 else 52


def level_floor(w, h, fps):
    """Lowest level_idc whose frame size, frame sides and macroblock rate hold this video: a file signaling less is
    mislabeled. Each side, in macroblocks, stays within sqrt(8 x the frame size) (H.264 A.3.1)."""
    n, side = mbs(w, h), max(-(-w // 16), -(-h // 16))
    return next((k for k, (rate, fs, _) in LEVELS.items() if n <= fs and side * side <= 8 * fs and n * fps <= rate), 99)


def max_br_kbps(level, profile):
    base = MAX_BR.get(level)
    if base is None:
        return None
    return base * 1.25 if profile.startswith("High") else base


def peak_mbps(packets, window=1.0):
    """Largest number of video megabits inside any `window` seconds, from (pts seconds, bytes) pairs."""
    packets = sorted(packets)
    best = total = j = 0
    for i, (t, size) in enumerate(packets):
        total += size
        while packets[j][0] <= t - window:
            total -= packets[j][1]
            j += 1
        best = max(best, total)
    return best * 8 / 1e6 / window


def moov_first(path):
    """True when the moov box precedes mdat (faststart), False when it follows, None when either is missing."""
    seen = []
    with open(path, "rb") as f:
        while len(seen) < 2:
            head = f.read(8)
            if len(head) < 8:
                break
            size, kind = struct.unpack(">I4s", head)
            if size == 1:
                size = struct.unpack(">Q", f.read(8))[0] - 8
            elif size == 0:
                break
            if kind in (b"moov", b"mdat"):
                seen.append(kind)
            f.seek(size - 8, 1)
    if b"moov" not in seen or b"mdat" not in seen:
        return None
    return seen[0] == b"moov"


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    ap = argparse.ArgumentParser(usage=__doc__)
    ap.add_argument("video")
    ap.add_argument("--frames", type=int)
    ap.add_argument("--max-mb", type=float)
    ap.add_argument("--no-audio", action="store_true", help="the file is meant to be silent")
    a = ap.parse_args()
    results = []

    def check(name, ok, detail, warn=False):
        results.append(ok or warn)
        print(f"{'PASS' if ok else 'WARN' if warn else 'FAIL'} {name}: {detail}")

    if not Path(a.video).is_file():
        sys.exit(f"{a.video}: no such file")
    p = run(["ffprobe", "-v", "error", "-count_packets", "-show_streams", "-show_format", "-of", "json", a.video])
    info = json.loads(p.stdout or "{}") if p.returncode == 0 else {}
    v = next((s for s in info.get("streams", []) if s.get("codec_type") == "video"), None)
    if v is None:
        print(f"FAIL probe: no readable video stream ({(p.stderr.strip().splitlines() or ['no output'])[-1]})")
        print("SOME CHECKS FAILED")
        sys.exit(1)
    w, h, level, profile = v["width"], v["height"], int(v.get("level", 0)), v.get("profile", "")
    check("codec", v.get("codec_name") == "h264", f"{v.get('codec_name')} {profile}")
    # canvas JPEGs are full range, so a render can carry yuvj420p: both are 8-bit 4:2:0
    check("pixel format", v.get("pix_fmt") in ("yuv420p", "yuvj420p"), v.get("pix_fmt"))
    check("size", w % 2 == 0 and h % 2 == 0, f"{w}x{h}")
    num, _, den = v.get("avg_frame_rate", "0/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else 0
    cap, floor = level_cap(w, h), level_floor(w, h, fps)
    check("level", floor <= level <= cap, f"{level / 10:g} ({floor / 10:g} to {cap / 10:g} at {w}x{h}, {fps:g} fps)")
    frames = int(v.get("nb_read_packets", 0))
    if a.frames is not None:
        check("frames", frames == a.frames, f"{frames}, expected {a.frames}")
    vdur = float(v.get("duration") or info["format"].get("duration") or 0)
    audio = next((s for s in info.get("streams", []) if s.get("codec_type") == "audio"), None)
    if a.no_audio:
        check("audio", audio is None, "none, as asked" if audio is None else f"{audio.get('codec_name')} present")
    elif audio is None:
        check("audio", False, "no audio stream (pass --no-audio for a silent file)")
    else:
        adur = float(audio.get("duration") or 0)
        check("audio", abs(adur - vdur) <= 0.1, f"{audio.get('codec_name')} {adur:.2f} s against {vdur:.2f} s of video")
    first = moov_first(a.video)
    check("faststart", first is True, {True: "moov before mdat", False: "moov after mdat (remux with -movflags +faststart)",
                                       None: "moov or mdat missing"}[first])
    d = run(["ffmpeg", "-v", "error", "-i", a.video, "-f", "null", "-"])
    errs = d.stderr.strip().splitlines()
    check("decode", d.returncode == 0 and not errs, "clean" if not errs else f"{len(errs)} error lines, first: {errs[0]}")
    mb = Path(a.video).stat().st_size / 1e6
    avg = mb * 8 / vdur if vdur else 0
    if a.max_mb is not None:
        check("file size", mb <= a.max_mb, f"{mb:.1f} MB (cap {a.max_mb:g} MB), {avg:.1f} Mb/s average")
    else:
        print(f"INFO file size: {mb:.1f} MB, {avg:.1f} Mb/s average")
    pk = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "packet=pts_time,size", "-of", "csv=p=0",
              a.video])
    packets = []
    for line in pk.stdout.splitlines():
        t, _, size = line.partition(",")
        if t not in ("", "N/A") and size:
            packets.append((float(t), int(size)))
    limit = max_br_kbps(level, profile)
    if packets and limit:
        peak = peak_mbps(packets)
        over = peak > limit / 1000
        check("peak bitrate", not over, f"{peak:.1f} Mb/s in the busiest second, level {level / 10:g} allows "
              f"{limit / 1000:g} Mb/s" + (" (some players stall above it: raise --crf)" if over else ""), warn=True)
    print("ALL CHECKS PASS" if all(results) else "SOME CHECKS FAILED")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
