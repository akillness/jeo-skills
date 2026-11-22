#!/usr/bin/env python3
"""Turn image-to-video clips of one side-view character into pixel-art sprite strips.

A side-scroller needs one facing only (the game mirrors the sprite when the
character turns), so this is a one-facing pipeline built on the helpers in
sprite_cycles.py, which must sit in the same folder. Input: one clip per cycle, named
<clips>/<name>_<cycle>.mp4, each animated from a square first frame on flat
magenta (#FF00FF) with the figure centered (reframe_stills.py makes these).

Every clip is keyed to alpha, then windowed by its mode:
  loop    the window whose last frame flows back into its first (run, walk,
          idle, or any other repeating cycle given a --range);
  attack  the active window of a one-shot action that starts and ends on the
          rest pose (attack, lunge, shoot, hurt, an air spin).
All cycles share one canvas that always includes the feet line, so every strip
registers on the same anchor, then an area-average downscale to --height px
for the figure, one median-cut palette of --palette colors and a 1 px
redrawn outline. Optional static poses join the same palette: a pose sheet
split into figures by connected components (--poses) and a reframed jump
still (--jump).

Writes <out>/<name>_<cycle>.png (one row per cycle), <out>/<name>_pose_<pose>.png
and <out>/<name>_meta.json (cell size, feet anchor, frames and fps per cycle,
pose sizes). Existing files are kept unless --force is given; --report prints
the windows and writes nothing.

Cycle spec: comma-separated NAME:MODE:FRAMES, MODE loop or attack.

Examples:
  # hero: eight clips, a pose sheet and the jump still, 56 px, 28 colors
  python3 side_sprites.py --clips clips --name hero --height 56 --palette 28 \\
      --cycles run:loop:8,idle:loop:8,atk1:attack:7,atk2:attack:7,spin:attack:8,shoot:attack:7,lunge:attack:6,hurt:attack:5 \\
      --poses hero_poses.png --pose-names fall,wall,plunge,dash --jump frames/hero_action.png \\
      --drop atk1=2 --out sprites
  # a ground enemy
  python3 side_sprites.py --clips clips --name heavy --height 78 \\
      --cycles walk:loop:8,attack:attack:8,hurt:attack:5 --out sprites
  # look at the loop windows first
  python3 side_sprites.py --clips clips --name heavy --cycles walk:loop:8 --report

Needs Python 3 with Pillow and NumPy, and ffmpeg and ffprobe on the PATH.
"""
import argparse
import json
import shutil
import sys
import types
from collections import deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
try:
    import numpy as np
    from PIL import Image
    import sprite_cycles as sc
except ImportError as error:
    sys.exit(f'error: {error}. This script needs Pillow and NumPy (python3 -m pip install pillow numpy) '
             'and sprite_cycles.py in the same folder.')

DEFAULT_CYCLES = 'run:loop:8,idle:loop:8,attack:attack:7,hurt:attack:5'
MODES = ('loop', 'attack')


def parse_cycles(spec):
    cycles = {}
    for item in spec.split(','):
        item = item.strip()
        if not item:
            continue
        parts = item.split(':')
        if len(parts) != 3 or parts[1] not in MODES or not parts[2].isdigit() or int(parts[2]) < 2:
            raise SystemExit(f'error: --cycles item {item!r}; use NAME:loop:8 or NAME:attack:7 (frames >= 2)')
        cycles[parts[0]] = (parts[1], int(parts[2]))
    if not cycles:
        raise SystemExit('error: --cycles is empty')
    return cycles


def parse_ranges(items, cycles):
    ranges = dict(sc.DEFAULT_RANGES)
    for item in items or []:
        cycle, sep, span = item.partition('=')
        lo, sep2, hi = span.partition(':')
        if not sep or not sep2 or not lo.isdigit() or not hi.isdigit() or not 2 <= int(lo) <= int(hi):
            raise SystemExit(f'error: --range {item!r}; use CYCLE=MIN:MAX in clip frames, 2 <= MIN <= MAX')
        ranges[cycle] = (int(lo), int(hi))
    for name, (mode, _) in cycles.items():
        if mode == 'loop' and name not in ranges:
            raise SystemExit(f'error: loop cycle {name!r} has no default period range; pass --range {name}=MIN:MAX')
    return ranges


def parse_drops(items):
    drops = {}
    for item in items or []:
        cycle, sep, idx = item.partition('=')
        try:
            values = sorted({int(v) for v in idx.split(',')})
        except ValueError:
            values = None
        if not sep or not values or min(values) < 0:
            raise SystemExit(f'error: --drop {item!r}; use CYCLE=INDEX[,INDEX] with 0-based frame indices')
        drops.setdefault(cycle, set()).update(values)
    return drops


def pick(name, mode, n, frames, fps, ranges, skip):
    return sc.pick(name, mode, frames, fps, ranges, types.SimpleNamespace(frames=n, skip=skip))


def split_poses(img, count):
    """Cut `count` figures out of a pose sheet by connected components (8-neighbor, on a 1/4 mask).
    Column runs fail when poses overlap horizontally; components do not. Ordered left to right."""
    rgba = sc.key(np.array(img.convert('RGB')))
    full = rgba[..., 3] > 0
    f = 4
    h, w = full.shape[0] // f, full.shape[1] // f
    m = full[:h * f, :w * f].reshape(h, f, w, f).any(axis=(1, 3))
    lab = np.zeros((h, w), np.int32)
    comps, n = [], 0
    for y in range(h):
        for x in range(w):
            if m[y, x] and not lab[y, x]:
                n += 1
                q = deque([(y, x)])
                lab[y, x] = n
                size = 0
                while q:
                    cy, cx = q.popleft()
                    size += 1
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = n
                            q.append((ny, nx))
                comps.append((size, n))
    if len(comps) < count:
        raise SystemExit(f'error: found {len(comps)} figure(s) on the pose sheet, expected {count}')
    keep = [c[1] for c in sorted(comps, reverse=True)[:count]]
    out = []
    for k in keep:
        mk = np.kron(lab == k, np.ones((f, f), bool))
        mk = np.pad(mk, ((0, full.shape[0] - mk.shape[0]), (0, full.shape[1] - mk.shape[1])))
        ys, xs = np.where(mk & full)
        sub = rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1].copy()
        sub[..., 3] = np.where(mk[ys.min():ys.max() + 1, xs.min():xs.max() + 1], sub[..., 3], 0)
        out.append((xs.min(), sub))
    return [s for _, s in sorted(out, key=lambda t: t[0])]


def finish(rgb, mask, pal, args):
    q = Image.fromarray(sc.punch(rgb, args.contrast, args.saturation))
    q = np.array(q.quantize(palette=pal, dither=Image.Dither.NONE).convert('RGB'))
    return Image.fromarray(sc.outline(np.dstack([q, np.where(mask, 255, 0).astype(np.uint8)]), args.outline))


def save(im, path, webp):
    if webp:
        im.save(path, lossless=True, quality=100, method=6)
    else:
        im.save(path)


def leftovers(meta_path, name, ext, targets):
    """Strips and poses listed by a previous run's meta file that this run will not rewrite."""
    if not meta_path.is_file():
        return []
    try:
        old = json.loads(meta_path.read_text())
    except ValueError:
        return []
    paths = [meta_path.parent / f'{name}_{c}{ext}' for c in old.get('cycles', {})]
    paths += [meta_path.parent / f'{name}_pose_{p}{ext}' for p in old.get('poses', {})]
    return [str(p) for p in paths if p.exists() and p not in targets]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--clips', type=Path, required=True, help='folder holding <name>_<cycle>.mp4')
    parser.add_argument('--name', required=True, help='character name (clip and output file prefix)')
    parser.add_argument('--out', type=Path, help='output folder (required unless --report)')
    parser.add_argument('--cycles', default=DEFAULT_CYCLES, help=f'NAME:MODE:FRAMES list (default {DEFAULT_CYCLES})')
    parser.add_argument('--range', action='append', metavar='CYCLE=MIN:MAX',
                        help='loop period search range in clip frames (repeatable); defaults walk=12:34 run=8:24 idle=24:66')
    parser.add_argument('--drop', action='append', metavar='CYCLE=I[,I]',
                        help='leave sampled frames (0-based) out of the strip, e.g. a frame where a slash trail keyed into a '
                             'solid block; they still count for the shared canvas and palette (repeatable)')
    parser.add_argument('--height', type=int, default=56, help='sprite height of the standing figure in px (default 56)')
    parser.add_argument('--palette', type=int, default=28, help='colors in the shared palette (default 28)')
    parser.add_argument('--poses', type=Path, help='optional pose sheet on flat magenta, one figure per pose, left to right')
    parser.add_argument('--pose-names', default='fall,wall,plunge,dash', help='names of the poses on the sheet, left to right')
    parser.add_argument('--pose-scale', type=float, default=0.122,
                        help='downscale factor for pose-sheet figures (default 0.122; tune until they match the strips)')
    parser.add_argument('--jump', type=Path, help='optional reframed jump still (for example <name>_action.png), written as pose "jump"')
    parser.add_argument('--skip', type=int, default=3, help='first clip frames never used as a loop start (default 3)')
    parser.add_argument('--canvas', type=int, default=960, help='side of the square first frame (default 960)')
    parser.add_argument('--figure', type=float, default=0.58, help='figure height as a share of the first frame (default 0.58)')
    parser.add_argument('--baseline', type=float, default=0.82, help='feet line as a share of the first frame (default 0.82)')
    parser.add_argument('--margin', type=int, default=8, help='transparent margin around the shared canvas, in clip px (default 8)')
    parser.add_argument('--contrast', type=float, default=1.12, help='contrast lift before the palette (default 1.12, 1 = off)')
    parser.add_argument('--saturation', type=float, default=1.12, help='saturation lift before the palette (default 1.12, 1 = off)')
    parser.add_argument('--outline', type=float, default=0.38, help='edge pixel brightness factor (default 0.38, 1 = off)')
    parser.add_argument('--webp', action='store_true', help='write lossless WebP instead of PNG')
    parser.add_argument('--report', action='store_true', help='print windows and seam scores, write nothing')
    parser.add_argument('--force', action='store_true', help='overwrite existing outputs')
    args = parser.parse_args()

    for tool in ('ffmpeg', 'ffprobe'):
        if shutil.which(tool) is None:
            sys.exit(f'error: {tool} not found on the PATH')
    if args.palette < 2 or args.height < 8:
        sys.exit('error: need --palette >= 2 and --height >= 8')
    if not args.report and args.out is None:
        sys.exit('error: --out is required unless --report is given')
    cycles = parse_cycles(args.cycles)
    ranges = parse_ranges(args.range, cycles)
    drops = parse_drops(args.drop)
    unknown = [c for c in drops if c not in cycles]
    if unknown:
        sys.exit(f'error: --drop names unknown cycle(s) {unknown}')
    pose_names = [p.strip() for p in args.pose_names.split(',') if p.strip()]
    for path in (args.poses, args.jump):
        if path is not None and not path.is_file():
            sys.exit(f'error: {path} not found')

    clips = {c: args.clips / f'{args.name}_{c}.mp4' for c in cycles}
    missing = [str(p) for p in clips.values() if not p.is_file()]
    if missing:
        sys.exit('error: missing clip(s): ' + ', '.join(missing) + ' (or narrow --cycles)')
    ext = '.webp' if args.webp else '.png'
    if not args.report:
        targets = [args.out / f'{args.name}_{c}{ext}' for c in cycles] + [args.out / f'{args.name}_meta.json']
        if args.poses:
            targets += [args.out / f'{args.name}_pose_{p}{ext}' for p in pose_names]
        if args.jump:
            targets.append(args.out / f'{args.name}_pose_jump{ext}')
        existing = [str(p) for p in targets if p.exists()]
        if existing and not args.force:
            sys.exit('error: would overwrite ' + ', '.join(existing) + ' (pass --force to replace)')
        stale = leftovers(args.out / f'{args.name}_meta.json', args.name, ext, set(targets))
        if stale:
            print('warning: left from an earlier run and not in this one; they will not match the new '
                  f'{args.name}_meta.json, delete them or add them back to --cycles/--poses: ' + ', '.join(stale))

    picked, infos = {}, {}
    for cycle, (mode, n) in cycles.items():
        frames, fps = sc.read_frames(clips[cycle], args.canvas)
        kept, info = pick(cycle, mode, n, frames, fps, ranges, args.skip)
        drop = drops.get(cycle, set())
        if drop and max(drop) >= len(kept):
            sys.exit(f'error: --drop {cycle} index {max(drop)} is past its {len(kept)} frames')
        picked[cycle] = kept
        info['dropped'] = sorted(drop)
        infos[cycle] = info
        score = info.get('seam_over_baseline')
        note = ''
        if score is not None and score > sc.WEAK_SEAM and cycle != 'idle':
            note = '  <- weak loop: widen --range for a slow stride, or re-run the clip'
        detail = f'seam {score}x baseline' if score is not None else 'active window'
        print(f'{args.name}_{cycle}: start {info["start"]}, length {info["length"]}, {detail}, '
              f'{info["fps"]} fps, {len(kept) - len(drop)} frames{note}')
    if args.report:
        return

    # One canvas for every cycle, symmetric about the center and always reaching the feet line.
    x0, y0, x1, y1 = sc.bbox([f for v in picked.values() for f in v])
    mid, m = args.canvas // 2, args.margin
    half = max(mid - x0, x1 - mid)
    feet_y = int(args.canvas * args.baseline)
    box = (mid - half - m, y0 - m, mid + half + m, max(y1, feet_y) + m)
    scale = args.height / (args.figure * args.canvas)
    pix = {k: sc.pixelate(v, box, scale) for k, v in picked.items()}

    pose_pix = {}
    if args.poses:
        figs = split_poses(Image.open(args.poses), len(pose_names))
        for name, fig in zip(pose_names, figs):
            pose_pix[name] = sc.pixelate([fig], (0, 0, fig.shape[1], fig.shape[0]), args.pose_scale)[0]
    if args.jump:
        jf = sc.key(np.array(Image.open(args.jump).convert('RGB')))
        ys, xs = np.where(jf[..., 3] > 0)
        if len(xs) == 0:
            sys.exit(f'error: no figure found in {args.jump}; is the background flat magenta?')
        pose_pix['jump'] = sc.pixelate([jf], (xs.min() - 4, ys.min() - 4, xs.max() + 5, ys.max() + 5), scale)[0]

    lifted = [sc.punch(rgb, args.contrast, args.saturation)[mask] for v in pix.values() for rgb, mask in v]
    lifted += [sc.punch(rgb, args.contrast, args.saturation)[mask] for rgb, mask in pose_pix.values()]
    px = np.concatenate(lifted)
    pal = Image.fromarray(px.reshape(1, -1, 3)).quantize(colors=args.palette, method=Image.Quantize.MEDIANCUT,
                                                         dither=Image.Dither.NONE)
    args.out.mkdir(parents=True, exist_ok=True)
    ch, cw = next(iter(pix.values()))[0][0].shape[:2]
    feet = round((feet_y - box[1]) * scale)
    meta = {'name': args.name, 'cell': [cw, ch], 'anchor': [cw // 2, feet], 'height': args.height,
            'palette': args.palette, 'box': list(box), 'scale': round(scale, 4), 'cycles': {}, 'poses': {}}
    for cycle, frames in pix.items():
        frames = [f for i, f in enumerate(frames) if i not in drops.get(cycle, set())]
        sheet = Image.new('RGBA', (cw * len(frames), ch), (0, 0, 0, 0))
        for k, (rgb, mask) in enumerate(frames):
            sheet.paste(finish(rgb, mask, pal, args), (k * cw, 0))
        path = args.out / f'{args.name}_{cycle}{ext}'
        save(sheet, path, args.webp)
        meta['cycles'][cycle] = {'frames': len(frames), 'fps': infos[cycle]['fps'], 'mode': cycles[cycle][0],
                                 'window': infos[cycle]}
        print(f'wrote {path} ({sheet.width}x{sheet.height}, cell {cw}x{ch})')
    for name, (rgb, mask) in pose_pix.items():
        im = finish(rgb, mask, pal, args)
        path = args.out / f'{args.name}_pose_{name}{ext}'
        save(im, path, args.webp)
        meta['poses'][name] = list(im.size)
        print(f'wrote {path} ({im.width}x{im.height})')
    meta_path = args.out / f'{args.name}_meta.json'
    meta_path.write_text(json.dumps(meta, indent=1))
    print(f'wrote {meta_path} (feet anchor {cw // 2},{feet})')


if __name__ == '__main__':
    main()
