#!/usr/bin/env python3
"""Find the liveliest stretch of a recorded take, to show the game at its best.

Scores every frame by how much the picture changes (ffmpeg scene score), then ranks windows of --length
seconds. A high score means action on screen; a flat one means the player stood still or a menu was up.
Always look at the frames of the winning window before using it: motion is not the same as beauty.

Usage:
  python3 best_window.py take.mp4 --length 3
  python3 best_window.py take.mp4 --length 10 --top 3 --cut best.mp4

Needs ffmpeg on PATH. Standard library only.
"""
import argparse
import re
import subprocess


def scores(path):
    err = subprocess.run(['ffmpeg', '-v', 'info', '-i', path, '-vf', "select='gte(scene,0)',metadata=print",
                          '-an', '-f', 'null', '-'], capture_output=True, text=True).stderr
    t = [float(x) for x in re.findall(r'pts_time:([\d.]+)', err)]
    s = [float(x) for x in re.findall(r'lavfi\.scene_score=([\d.]+)', err)]
    return list(zip(t, s))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('take')
    ap.add_argument('--length', type=float, default=3.0)
    ap.add_argument('--top', type=int, default=3)
    ap.add_argument('--skip', type=float, default=1.0, help='ignore the first seconds (loading, title)')
    ap.add_argument('--cut', help='also cut the best window to this file')
    a = ap.parse_args()

    pts = [(t, s) for t, s in scores(a.take) if t >= a.skip]
    if not pts:
        raise SystemExit('no frames scored')
    end = pts[-1][0]
    ranked = []
    step = 0.25
    start = pts[0][0]
    while start + a.length <= end:
        win = [s for t, s in pts if start <= t < start + a.length]
        # motion everywhere beats one big spike: reward the median as much as the mean
        if win:
            med = sorted(win)[len(win) // 2]
            ranked.append((sum(win) / len(win) + med, round(start, 2)))
        start += step
    ranked.sort(reverse=True)
    picked = []
    for score, st in ranked:
        if all(abs(st - p) >= a.length for _, p in picked):
            picked.append((score, st))
        if len(picked) == a.top:
            break
    for score, st in picked:
        print(f'{st:6.2f} s -> {st + a.length:6.2f} s   score {score:.4f}')
    if a.cut and picked:
        st = picked[0][1]
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(st), '-i', a.take, '-t', str(a.length),
                        '-c:v', 'libx264', '-crf', '18', '-an', a.cut], check=True)
        print(a.cut)


if __name__ == '__main__':
    main()
