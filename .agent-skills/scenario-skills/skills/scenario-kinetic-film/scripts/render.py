"""Render the film to video, without sound, in parallel workers.

usage: render.py <film folder> [--res 4k|1080|720] [--workers N] [--out FILE] [--from F --to F] [--info FILE]

Serves the folder, asks the film for its length, frame rate and cuts (info.mjs, or --info), splits the
frames across workers (each a headless Chrome plus an encoder, post.py), checks every frame arrived, and
joins the parts into out/video_<res>.mp4. Workers are sized to memory: a 4K worker needs about 11 GB.
"""

import argparse
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from filmserver import film_info, serve, stop  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DSF = {"4k": 2, "1080": 1, "720": 2 / 3}
GB_PER_WORKER = {"4k": 11, "1080": 4, "720": 3}
MAX_WORKERS = {"4k": 3, "1080": 6, "720": 6}


def ram_gb():
    """Physical memory in GB (sysctl on macOS, sysconf elsewhere)."""
    try:
        return int(subprocess.run(["sysctl", "-n", "hw.memsize"], capture_output=True, text=True).stdout) / 2**30
    except (OSError, ValueError):
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 2**30


def plan_workers(res, ram, cpus):
    """As many workers as memory, CPUs (3 each) and the resolution's cap allow, and at least one."""
    return max(1, min(MAX_WORKERS[res], int(ram // GB_PER_WORKER[res]), cpus // 3))


def split_frames(f0, f1, n):
    """[(start, end)] chunks covering f0..f1 once, in order, for up to n workers."""
    step = -(-(f1 - f0) // n)
    return [(s, min(f1, s + step)) for s in range(f0, f1, step)]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("film")
    ap.add_argument("--res", default="1080", choices=["4k", "1080", "720"])
    ap.add_argument("--workers", type=int, help="override the memory plan (more than it allows can stall the machine)")
    ap.add_argument("--out", help="default: <film>/out/video_<res>.mp4")
    ap.add_argument("--from", dest="f0", type=int, help="first frame (default 0)")
    ap.add_argument("--to", dest="f1", type=int, help="frame to stop before (default: the last)")
    ap.add_argument("--info", help="film metadata JSON from info.mjs, instead of asking the film")
    a = ap.parse_args(argv)
    info = film_info(a.film, a.info)
    fps = info["fps"]
    total = round(info["dur"] * fps)
    f0 = a.f0 if a.f0 is not None else 0
    f1 = a.f1 if a.f1 is not None else total
    if not 0 <= f0 < f1 <= total:
        sys.exit(f"--from {f0} --to {f1}: needs 0 <= from < to <= {total} (the film's frame count)")
    ram, cpus = ram_gb(), os.cpu_count() or 1
    planned = plan_workers(a.res, ram, cpus)
    workers = a.workers or planned
    if workers > planned:
        print(f"warning: {workers} workers is more than this machine's memory plan ({planned}); it may stall", flush=True)
    out = a.out or os.path.join(a.film, "out", f"video_{a.res}.mp4")
    parts = os.path.join(os.path.dirname(os.path.abspath(out)), "parts")
    os.makedirs(parts, exist_ok=True)
    chunks = split_frames(f0, f1, workers)
    print(f"{info.get('title') or 'film'}: {f1 - f0} frames at {fps} fps, {a.res}, {len(chunks)} workers ({ram:.0f} GB RAM)", flush=True)
    url, server = serve(a.film)
    env = {**os.environ, "FILM_URL": url, "FILM_DIR": os.path.abspath(a.film)}
    jobs = []
    try:
        for i, (s, e) in enumerate(chunks):
            part = os.path.join(parts, f"part{i}.mp4")
            # the worker keeps its own copy of the log handle; -I keeps user site-packages out of the worker
            with open(os.path.join(parts, f"part{i}.log"), "w") as log:
                cmd = [sys.executable, "-I", os.path.join(HERE, "post.py"), str(DSF[a.res]), str(s), str(e), part, str(fps)]
                jobs.append((part, subprocess.Popen(cmd, env=env, stdout=log, stderr=subprocess.STDOUT)))
        bad = [p for p, j in jobs if j.wait() != 0]
    finally:
        stop(server)
    if bad:
        sys.exit(f"frames missing in {', '.join(bad)}: see the .log beside each part")
    listing = os.path.join(parts, "list.txt")
    with open(listing, "w") as fh:
        fh.write("".join(f"file '{os.path.basename(p)}'\n" for p, _ in jobs))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", listing, "-c", "copy", "-movflags", "+faststart", out], check=True)
    count = ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0", "-show_entries", "stream=nb_read_frames", "-of", "csv=p=0", out]
    n = subprocess.run(count, capture_output=True, text=True).stdout.strip()
    print(f"{out}: {n} frames (expected {f1 - f0})")
    # the workers count frames sent, not frames in the joined file
    if n != str(f1 - f0):
        sys.exit(f"{out} holds {n or 'no readable'} frames, not {f1 - f0}: the join or the encode lost frames")


if __name__ == "__main__":
    main()
