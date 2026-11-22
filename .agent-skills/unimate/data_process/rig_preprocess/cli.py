"""Command line of ``rig_preprocess``.

    python -m data_process.rig_preprocess run --input ASSET [...] --output_dir DIR [options]
    python -m data_process.rig_preprocess verify --output_dir DIR [--profile P] [--report FILE]

``run`` needs the bpy module (the ``unimate`` env, or Blender's own Python);
``verify`` does not. Both exit non-zero on failure (``verify``: on any
``different`` verdict).
"""

import argparse
import json
import os
import sys

from loguru import logger

from data_process.rig_preprocess.annotate import MODES
from data_process.rig_preprocess.profiles import AUTO, PROFILES, pick_profile


def _add_run(sub):
    ap = sub.add_parser('run', help="Process one asset into cond.npy + <name>.glb.")
    ap.add_argument('--input', nargs='+', required=True,
                    help="The asset file (GLB/GLTF/FBX); for --profile truebones, the "
                         "{Species}-{Action}.fbx clips of one species.")
    ap.add_argument('--output_dir', required=True,
                    help="The asset directory to write (cond.npy, <name>.glb, preview.png, "
                         "summary.json).")
    ap.add_argument('--profile', default=AUTO, choices=[AUTO] + sorted(PROFILES),
                    help="Dataset whose processing to reproduce. auto (default): truebones "
                         "for several {Species}-{Action}.fbx clips, the --dataset_export_dir "
                         "dataset with --annotate dataset, else general.")
    ap.add_argument('--annotate', default=None, choices=MODES,
                    help="Joint-name / facing-pair source: llm (default when an LLM is "
                         "configured: an API key for --model, or a local model), rule "
                         "(offline; the default otherwise), or dataset (the dataset's own "
                         "entries; training assets only).")
    ap.add_argument('--annotate_names', default=None, choices=('rule', 'llm'),
                    help="Joint-name source when it differs from --annotate (rule / llm modes).")
    ap.add_argument('--annotate_face', default=None, choices=('rule', 'llm'),
                    help="Face-pair source when it differs from --annotate (rule / llm modes).")
    ap.add_argument('--name', default=None,
                    help="Object type to give the asset (default: the exporter's name for it).")
    ap.add_argument('--face_r', default=None, help="Raw name of the right (or head) face joint.")
    ap.add_argument('--face_l', default=None, help="Raw name of the left (or tail) face joint.")
    ap.add_argument('--body_axis', action='store_true',
                    help="The face pair is a head / tail axis.")
    ap.add_argument('--dataset_export_dir', default=None,
                    help="Dataset export for --annotate dataset (default: dataset/export/<profile>).")
    ap.add_argument('--patch_dir', default='dataset/UniML3D/patches',
                    help="Patch files for --annotate dataset.")
    ap.add_argument('--keep_intermediate', action='store_true',
                    help="Keep work/ (export/, features/ with the training clips, "
                         "canonical_assets/) in the dataset layout.")
    review = ap.add_mutually_exclusive_group()
    review.add_argument('--review', dest='review', action='store_true', default=None,
                        help="Stop after the annotation, before the cond: write annotation.json, "
                             "annotation_preview.png and REVIEW.md to check the joint labels "
                             "and the facing pair (by hand, or with an LLM / coding agent). The "
                             "default, except with --annotation or --annotate dataset.")
    review.add_argument('--no_review', dest='review', action='store_false',
                        help="Build the cond directly from the automatic annotation.")
    ap.add_argument('--annotation', default=None,
                    help="A reviewed annotation.json: its labels and facing pair replace the "
                         "annotation (with --review: the review files are written from it).")
    ap.add_argument('--overwrite', action='store_true', help="Replace an earlier run's outputs.")
    ap.add_argument('--formats', default='glb',
                    help="Canonical asset files, comma-separated: glb (always) and fbx.")
    ap.add_argument('--save_clips', action='store_true',
                    help="Keep the asset's stage-4 feature clips in <output_dir>/motions/: "
                         "the ground truth in-betweening and motion editing hold.")
    ap.add_argument('--no_preview', action='store_true', help="Skip preview.png.")
    ap.add_argument('--rest_rotation', default=None,
                    help="Stand up a rest pose authored lying down or upside down: axis turns "
                         "in degrees applied in order, e.g. x180, x90, x-90, x90,y180 "
                         "(not with --annotate dataset).")
    ap.add_argument('--exp_dir', default=None,
                    help="Training run whose joint width (config.json) the asset is checked "
                         "against (default: the released UniML3D models' width, 71).")
    ap.add_argument('--fps', type=int, default=30,
                    help="Sample rate of the exported clips (training reads 30 fps clips; "
                         "the cond and canonical GLB do not depend on it).")
    ap.add_argument('--rig_timeout', type=int, default=300,
                    help="LLM sources: seconds per LLM call before the rule fallback (0: none).")
    from data_process.joint_annotation.llm import add_llm_args
    add_llm_args(ap, default_max_tokens=8192)


def _add_verify(sub):
    ap = sub.add_parser('verify', help="Compare an output with the dataset's copy of the asset.")
    ap.add_argument('--output_dir', required=True, help="A rig_preprocess output directory.")
    ap.add_argument('--profile', default=None,
                    help="Dataset to compare with (default: the dataset annotated from, "
                         "else the output's profile).")
    ap.add_argument('--dataset_root', default='dataset',
                    help="Root holding features/<ds>/cond.npy and canonical_assets/<ds>/.")
    ap.add_argument('--report', default=None, help="Also write the report JSON here.")


def _llm_configured(args):
    """Whether the LLM backend of *args* can run: a local model, or an API key
    for the model (``--api_key`` or its environment variable)."""
    from data_process.joint_annotation.llm import BACKEND_LOCAL, detect_backend
    if (args.backend or detect_backend(args.model)) == BACKEND_LOCAL or args.api_key:
        return True
    var = 'DEEPSEEK_API_KEY' if args.model.startswith('deepseek') else 'OPENAI_API_KEY'
    return bool(os.environ.get(var))


def _annotate_mode(args):
    """``--annotate`` as given; otherwise ``rule`` when ``--annotation`` or a
    single-source flag (``--annotate_names`` / ``--annotate_face``) decides, so
    the other source stays the offline rules, else ``llm`` when an LLM is
    configured, else ``rule``."""
    if args.annotate is not None:
        return args.annotate
    if args.annotation or args.annotate_names or args.annotate_face:
        return 'rule'
    if _llm_configured(args):
        return 'llm'
    var = 'DEEPSEEK_API_KEY' if args.model.startswith('deepseek') else 'OPENAI_API_KEY'
    logger.warning(f"No LLM configured for --model {args.model} ({var} unset, no --api_key): "
                   f"labelling with the offline rules; check the labels closely, or set the "
                   f"key for LLM labels.")
    return 'rule'


def _run(args):
    from data_process.rig_preprocess.pipeline import preprocess   # needs bpy
    if bool(args.face_r) != bool(args.face_l):
        logger.error("--face_r and --face_l give the pair together; pass both or neither.")
        return 2
    if args.body_axis and not args.face_r:
        logger.error("--body_axis marks a hand-given head / tail pair; pass it with --face_r / --face_l.")
        return 2
    if args.face_r and args.annotate_face == 'llm':
        logger.error("--face_r / --face_l give the facing pair by hand; drop --annotate_face llm.")
        return 2
    args.annotate = _annotate_mode(args)
    if (args.face_r and args.face_l and args.annotate_face is None
            and args.annotate != 'dataset' and not args.annotation):
        args.annotate_face = 'rule'     # the hand-given pair replaces any selected one
    llm_sources = [flag for flag, mode in (('--annotate_names', args.annotate_names or args.annotate),
                                           ('--annotate_face', args.annotate_face or args.annotate))
                   if mode == 'llm']
    if args.annotate != 'dataset' and not args.annotation and llm_sources \
            and not _llm_configured(args):
        asked = '--annotate llm' if args.annotate == 'llm' else ' / '.join(f'{f} llm' for f in llm_sources)
        logger.error(f"{asked} needs an LLM for --model {args.model}: set its API key "
                     f"(DEEPSEEK_API_KEY / OPENAI_API_KEY, or --api_key) or use a local model.")
        return 2
    client = None
    if args.annotate != 'dataset' and not args.annotation and 'llm' in (
            args.annotate_names or args.annotate, args.annotate_face or args.annotate):
        from data_process.joint_annotation.llm import LLMClient
        client = LLMClient.from_args(args)
    profile = args.profile
    if profile == AUTO:
        # what auto stands for, to default --dataset_export_dir; preprocess
        # resolves it again (and records that it was chosen automatically)
        profile = pick_profile(args.input, args.dataset_export_dir
                               if args.annotate == 'dataset' else None)
    preprocess(args.input, args.output_dir, profile=args.profile,
               annotate_mode=args.annotate, name=args.name, face_r=args.face_r,
               face_l=args.face_l, body_axis=args.body_axis,
               dataset_export_dir=args.dataset_export_dir or os.path.join(
                   'dataset', 'export', profile),
               patch_dir=args.patch_dir, llm_client=client,
               llm_options=None if client is None else {'max_tokens': args.max_tokens,
                                       'max_retries': args.max_retries,
                                       'timeout_seconds': args.rig_timeout},
               overwrite=args.overwrite,
               keep_intermediate=args.keep_intermediate, fps=args.fps,
               names_mode=args.annotate_names, face_mode=args.annotate_face,
               exp_dir=args.exp_dir,
               formats=tuple(f.strip() for f in args.formats.split(',') if f.strip()),
               save_clips=args.save_clips, preview=not args.no_preview,
               rest_rotation=args.rest_rotation, review=_review(args),
               annotation=args.annotation)
    return 0


def _review(args):
    """``--review`` / ``--no_review`` as given; otherwise review, unless the run
    continues from an ``--annotation`` file or takes the dataset's reviewed
    labels (``--annotate dataset``)."""
    if args.review is not None:
        return args.review
    return not (args.annotation or args.annotate == 'dataset')


def _verify(args):
    from data_process.rig_preprocess.verify import verify
    with open(os.path.join(args.output_dir, 'summary.json')) as f:
        summary = json.load(f)
    report = verify(args.output_dir, summary['name'], args.profile or summary.get('reference') or summary['profile'],
                    args.dataset_root)
    text = json.dumps(report, indent=2, default=str)
    print(text)
    if args.report:
        with open(args.report, 'w') as f:
            f.write(text)
    return int(any(report[k].get('verdict') == 'different' for k in ('cond', 'canonical_glb')))


def main(argv=None):
    """Parse *argv* (default ``sys.argv``) and run ``run`` or ``verify``;
    returns the exit code."""
    ap = argparse.ArgumentParser(
        prog='python -m data_process.rig_preprocess',
        description="Process one rigged 3D asset (with or without animation) into the "
                    "model's cond and canonical GLB, and check it against the dataset.")
    sub = ap.add_subparsers(dest='command', required=True)
    _add_run(sub)
    _add_verify(sub)
    args = ap.parse_args(argv)
    from data_process.joint_annotation.llm import FatalLLMError
    try:
        return _run(args) if args.command == 'run' else _verify(args)
    except FatalLLMError as exc:
        logger.error(f"rig_preprocess {args.command} failed: the LLM call failed ({exc}); fix the "
                     f"API key or account, or label offline with --annotate rule.")
        return 1
    except (FileNotFoundError, FileExistsError, ValueError, RuntimeError) as exc:
        logger.error(f"rig_preprocess {args.command} failed: {exc}")
        return 1


if __name__ == '__main__':
    sys.exit(main())
