#!/usr/bin/env python3
"""Render an export-stage skeleton as video with its caption burned in.

QA tool for the caption layer: it puts the text and the motion it is supposed
to describe in one frame, so a wrong direction, a missing second phase or a
body part that never moves is visible without cross-referencing anything.

Input is the export layer (``dataset/export/<ds>/motions/<clip>.npz`` plus
``motion_captions.json``), not the feature layer, so what you see is the same
data the renderer showed the captioner. Frames are truncated to
``--max_frames`` (default 1000), which is long enough that only a handful of
clips are cut at all. Note that the captioner itself only ever saw the first
``blender_render.MAX_RENDER_FRAMES`` (200) frames, so a mismatch beyond frame
200 is a gap in the caption's coverage, not necessarily a wrong caption; pass
``--max_frames 200`` to review exactly what it saw.

The skeleton is drawn on a world-anchored checkerboard floor with a contact
shadow and a root trail, so translation reads off the tiles scrolling
underfoot — which is what makes "walks forward" vs "walks in place" legible.

The look follows the stage-4 clip previews in ``dataset/features/<ds>/videos``
(``motion_features.save_clip`` with ``vis_ground=True``): same renderer, same
``PREVIEW_FIGSIZE`` / ``PREVIEW_DPI``, and the caption alone as the title. Two
differences: the source is the export clip the captioner actually saw, at its
full joint count and in the asset's own frame, rather than the canonicalized
stage-4 clip; and the joints keep the renderer's plain red-root / blue-joint
scheme instead of stage 4's spectral palette, which recolours every skeleton
differently and makes body parts harder to follow across clips.

Usage (from the repo root):
    # one clip
    python -m data_process.tools.vis_caption truebones --clips Lion-Die

    # a random sample, each as its own MP4 plus one tiled grid video
    python -m data_process.tools.vis_caption mixamo --random 6 --grid

    # every captioned clip of a dataset, rendered in parallel and resumable
    python -m data_process.tools.vis_caption mixamo --all --workers 16

    # a contact sheet PNG as well (for pasting into a review)
    python -m data_process.tools.vis_caption truebones --random 4 --grid --sheet

Outputs land in ``outputs/caption_vis/<dataset>/``.
"""

import argparse
import json
import os
import random
import sys

import imageio
import numpy as np
from concurrent.futures import ProcessPoolExecutor

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from data_process.utils.kinematics import clip_global  # noqa: E402
from data_process.utils.motion_features import (  # noqa: E402
    PREVIEW_DPI, PREVIEW_FIGSIZE)
from data_process.utils.plotting import render_skeleton_motion_ground  # noqa: E402

DATASETS = ('truebones', 'mixamo', 'objaverse', 'general')
MAX_RENDER_FRAMES = 200     # keep in sync with blender_render.MAX_RENDER_FRAMES
DEFAULT_MAX_FRAMES = 1000   # render cost is linear in frames; 1000 cuts almost nothing


def export_dir(root, ds):
    return os.path.join(root, 'dataset', 'export', ds)


def load_captions(root, ds):
    path = os.path.join(export_dir(root, ds), 'motion_captions.json')
    if not os.path.isfile(path):
        raise SystemExit('no captions for %s at %s' % (ds, path))
    with open(path) as f:
        return json.load(f)


def load_clip(root, ds, clip, max_frames):
    """(parents, positions (T, J, 3)) for one export clip, Y-up as exported."""
    path = os.path.join(export_dir(root, ds), 'motions', clip + '.npz')
    if not os.path.isfile(path):
        raise SystemExit('no such clip: %s' % path)
    d = np.load(path, allow_pickle=True)
    return np.asarray(d['parents']), clip_global(d, max_frames=max_frames)


def tile(frame_stacks, labels=None):
    """Tile per-clip frame stacks into one video, holding each clip's last frame."""
    n = len(frame_stacks)
    cols = int(np.ceil(np.sqrt(n)))
    rows = int(np.ceil(n / cols))
    T = max(len(f) for f in frame_stacks)
    H, W = frame_stacks[0].shape[1:3]
    out = np.full((T, rows * H, cols * W, 3), 255, dtype=np.uint8)
    for i, fr in enumerate(frame_stacks):
        held = np.concatenate([fr, np.repeat(fr[-1:], T - len(fr), axis=0)]) if len(fr) < T else fr
        r, c = divmod(i, cols)
        out[:, r * H:(r + 1) * H, c * W:(c + 1) * W] = held[:T, :H, :W]
    return out


def _title(clip, caption, with_clip_name):
    return '%s\n%s' % (clip, caption) if with_clip_name else caption


def _render_one(job):
    """Render one clip to <out_dir>/<clip>.mp4. Runs in a worker process."""
    (root, ds, clip, caption, out_dir, max_frames, elev, azim,
     trail, figsize, dpi, fps, with_clip_name) = job
    try:
        parents, pos = load_clip(root, ds, clip, max_frames)
        frames = render_skeleton_motion_ground(
            parents, pos, elev=elev, azim=azim, rotate_root=True,
            title=_title(clip, caption, with_clip_name), trail=trail,
            figsize=tuple(figsize), dpi=dpi)
        # Write to a sibling temp file and rename: a run that is killed
        # mid-encode must not leave a half-written MP4 behind, because
        # --skip_existing would then treat it as done on the next pass.
        final = os.path.join(out_dir, clip + '.mp4')
        tmp = os.path.join(out_dir, '.%s.tmp.mp4' % clip)   # keep .mp4: imageio picks the plugin by extension
        imageio.mimwrite(tmp, frames, fps=fps)
        os.replace(tmp, final)
        return clip, len(pos), None
    except Exception as e:                      # one bad clip must not stop the batch
        return clip, 0, '%s: %s' % (type(e).__name__, e)


def main():
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('dataset', choices=DATASETS)
    ap.add_argument('--clips', nargs='+', default=None, help='clip names (export stems)')
    ap.add_argument('--random', type=int, default=0, help='sample N random clips instead')
    ap.add_argument('--clips_file', default=None,
                    help='file with one clip name per line (# comments and blanks ignored); '
                         'for a subset too long for a command line, e.g. only the clips that '
                         'survive filtered_clips.txt / filtered_objects.txt')
    ap.add_argument('--all', action='store_true',
                    help='every captioned clip of the dataset; implies --skip_existing '
                         'so an interrupted run resumes. Not compatible with --grid / '
                         '--sheet, which hold every frame of every clip in memory.')
    ap.add_argument('--workers', type=int, default=1,
                    help='render this many clips in parallel (one process each)')
    ap.add_argument('--skip_existing', action='store_true',
                    help='leave clips that already have an MP4 in the output dir alone')
    ap.add_argument('--seed', type=int, default=0)
    ap.add_argument('--output_dir', default=None,
                    help='default outputs/caption_vis/<dataset>')
    ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--max_frames', type=int, default=DEFAULT_MAX_FRAMES,
                    help='0 = whole clip; default %d. Pass %d to see exactly the '
                         'range the captioner saw' % (DEFAULT_MAX_FRAMES, MAX_RENDER_FRAMES))
    ap.add_argument('--grid', action='store_true', help='also write one tiled MP4')
    ap.add_argument('--sheet', action='store_true', help='also write a contact-sheet PNG')
    ap.add_argument('--sheet_cols', type=int, default=6, help='frames per row in the sheet')
    # the stage-4 previews take render_skeleton_motion_ground's own defaults
    # (save_clip passes no camera), so match them here rather than inventing a view
    ap.add_argument('--elev', type=float, default=20.0)
    ap.add_argument('--azim', type=float, default=-60.0)
    ap.add_argument('--figsize', type=float, nargs=2, default=PREVIEW_FIGSIZE,
                    help='default matches the stage-4 previews')
    ap.add_argument('--dpi', type=int, default=PREVIEW_DPI,
                    help='default matches the stage-4 previews')
    ap.add_argument('--with_clip_name', action='store_true',
                    help='put the clip name above the caption; off by default so the '
                         'frame carries the caption alone, like the stage-4 previews')
    ap.add_argument('--no_trail', action='store_true')
    args = ap.parse_args()

    caps = load_captions(root, args.dataset)
    if args.all:
        clips = sorted(caps)
    elif args.random:
        random.seed(args.seed)
        clips = random.sample(sorted(caps), min(args.random, len(caps)))
    elif args.clips_file:
        clips = [l.split('#')[0].strip() for l in open(args.clips_file)]
        clips = [c for c in clips if c]
    elif args.clips:
        clips = args.clips
    else:
        raise SystemExit('give --clips, --clips_file, --random N or --all')
    if args.all and (args.grid or args.sheet):
        raise SystemExit('--grid / --sheet keep every frame in memory; use --random N for those')

    out_dir = args.output_dir or os.path.join(root, 'outputs', 'caption_vis', args.dataset)
    os.makedirs(out_dir, exist_ok=True)

    if args.skip_existing or args.all:
        before = len(clips)
        clips = [c for c in clips if not os.path.isfile(os.path.join(out_dir, c + '.mp4'))]
        if before != len(clips):
            print('skipping %d clip(s) already rendered' % (before - len(clips)))

    if args.workers > 1:
        jobs = [(root, args.dataset, c, caps[c], out_dir, args.max_frames, args.elev,
                 args.azim, not args.no_trail, args.figsize, args.dpi, args.fps,
                 args.with_clip_name)
                for c in clips if c in caps]
        print('rendering %d clip(s) with %d workers -> %s' % (len(jobs), args.workers, out_dir))
        done = failed = 0
        with ProcessPoolExecutor(args.workers) as ex:
            for clip, n, err in ex.map(_render_one, jobs, chunksize=4):
                if err:
                    failed += 1
                    print('  FAILED %-38s %s' % (clip, err))
                else:
                    done += 1
                    if done % 100 == 0 or done == len(jobs):
                        print('  %d/%d rendered' % (done, len(jobs)), flush=True)
        print('wrote %d MP4(s) to %s%s' % (done, out_dir,
                                           ', %d failed' % failed if failed else ''))
        return

    stacks, kept = [], []
    for clip in clips:
        if clip not in caps:
            print('  skip %s (no caption)' % clip)
            continue
        parents, pos = load_clip(root, args.dataset, clip, args.max_frames)
        caption = caps[clip]
        print('  %-38s %3d frames | %s' % (clip, len(pos), caption))
        frames = render_skeleton_motion_ground(
            parents, pos, elev=args.elev, azim=args.azim,
            # The export layer is Y-up; _maybe_rotate_y_up maps input Y onto
            # matplotlib's vertical Z axis, so Y-up data wants rotate_root=True.
            rotate_root=True,
            title=_title(clip, caption, args.with_clip_name),
            trail=not args.no_trail, figsize=tuple(args.figsize), dpi=args.dpi)
        final = os.path.join(out_dir, clip + '.mp4')
        tmp = os.path.join(out_dir, '.%s.tmp.mp4' % clip)
        imageio.mimwrite(tmp, frames, fps=args.fps)
        os.replace(tmp, final)
        stacks.append(frames)
        kept.append(clip)

    if not kept:
        raise SystemExit('nothing rendered')
    print('wrote %d MP4(s) to %s' % (len(kept), out_dir))

    if args.grid and len(kept) > 1:
        grid = tile(stacks)
        p = os.path.join(out_dir, 'grid_%s.mp4' % '_'.join(kept[:3])[:60])
        imageio.mimwrite(p, grid, fps=args.fps)
        print('wrote grid  %s  (%d frames, %dx%d)' % (p, len(grid), grid.shape[2], grid.shape[1]))

    if args.sheet:
        cols = args.sheet_cols
        rowsimg = []
        for clip, fr in zip(kept, stacks):
            idx = [round(i * (len(fr) - 1) / max(cols - 1, 1)) for i in range(cols)]
            rowsimg.append(np.concatenate([fr[i] for i in idx], axis=1))
        sheet = np.concatenate(rowsimg, axis=0)
        p = os.path.join(out_dir, 'sheet_%s.png' % '_'.join(kept[:3])[:60])
        imageio.imwrite(p, sheet)
        print('wrote sheet %s  (%dx%d)' % (p, sheet.shape[1], sheet.shape[0]))


if __name__ == '__main__':
    main()
