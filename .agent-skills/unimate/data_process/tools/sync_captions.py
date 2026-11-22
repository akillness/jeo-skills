#!/usr/bin/env python3
"""Refresh the caption files of existing stage-4 feature directories.

Stage 4 writes ``captions.json`` and ``captions_<v>.json`` (v = generic,
detail) on every run,
but captions can change without anything else changing (a patch applied by
``tools/patch_annotations.py``), and a stage-4 rerun is expensive. This copies
the export captions into ``features/<ds>/``, keyed like that directory's
``captions.json`` (``<clip>-<NNN>``) with the same helper stage 4 uses:

  * ``captions.json``          values refreshed from ``motion_captions.json``;
                               the key set is never changed (which clips exist
                               is stage 4's decision, not this tool's)
  * ``captions_generic.json``  rebuilt from ``motion_captions_generic.json``
  * ``captions_detail.json``   rebuilt from ``motion_captions_detail.json``

After it changes anything, refresh the text-embedding cache
(``python -m unimate.tools.precompute_text_emb``); stale cache entries are
detected by their text and re-encoded. ``cond.npy`` keeps the old captions per
object, which nothing reads; stage 4's resume cache sees the caption digest
change and re-processes those objects on its next run.

Usage (from the repo root):
    python data_process/tools/sync_captions.py [--datasets truebones mixamo] [--dry_run]
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from data_process.feature_extraction.metadata import (  # noqa: E402
    EXTRA_CAPTION_VERSIONS, by_feature_key, load_extra_captions, load_json,
    load_motion_captions, save_json,
)

DATASETS = ('truebones', 'mixamo', 'objaverse', 'general')


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    repo = os.path.abspath(os.path.join(here, '..', '..'))
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--export_root', default=os.path.join(repo, 'dataset', 'export'))
    ap.add_argument('--features_root', default=os.path.join(repo, 'dataset', 'features'))
    ap.add_argument('--datasets', nargs='+', default=list(DATASETS))
    ap.add_argument('--dry_run', action='store_true', help='report only, write nothing')
    args = ap.parse_args()

    for ds in args.datasets:
        export_dir = os.path.join(args.export_root, ds)
        feat_dir = os.path.join(args.features_root, ds)
        captions_path = os.path.join(feat_dir, 'captions.json')
        captions = load_json(captions_path)
        if captions is None:
            print(f'[{ds}] skipped: no {captions_path}')
            continue

        normal = load_motion_captions(export_dir) or {}
        fresh = by_feature_key(captions, normal)
        changed = {k: (captions[k], fresh[k]) for k in fresh if fresh[k] != captions[k]}
        orphans = sorted(set(captions) - set(fresh))
        print(f'[{ds}] captions.json: {len(changed)} of {len(captions)} captions change'
              + (f'; {len(orphans)} feature clips have no export caption (kept), e.g. {orphans[:3]}'
                 if orphans else ''))
        for k, (old, new) in sorted(changed.items())[:5]:
            print(f'    {k}: {old!r} -> {new!r}')
        if changed and not args.dry_run:
            save_json(captions_path, {k: fresh.get(k, v) for k, v in captions.items()})

        # Same rule as stage 4 (metadata.save_outputs): captions_<v>.json exists
        # exactly when some saved clip has a <v> caption; otherwise a stale one goes.
        for version in EXTRA_CAPTION_VERSIONS:
            name = f'captions_{version}.json'
            path = os.path.join(feat_dir, name)
            out = by_feature_key(captions, load_extra_captions(export_dir, version) or {})
            if out:
                old = load_json(path) or {}
                n_changed = sum(old.get(k) != v for k, v in out.items()) + len(set(old) - set(out))
                missing = sorted(set(captions) - set(out))
                print(f'[{ds}] {name}: {len(out)}/{len(captions)} feature clips, '
                      f'{n_changed} entries change'
                      + (f'; {len(missing)} without, e.g. {missing[:3]}' if missing else ''))
                if n_changed and not args.dry_run:
                    save_json(path, out)
            else:
                print(f'[{ds}] no {version} captions for any feature clip in {export_dir}'
                      + (f'; removing stale {name}' if os.path.isfile(path) else ''))
                if os.path.isfile(path) and not args.dry_run:
                    os.remove(path)


if __name__ == '__main__':
    main()
