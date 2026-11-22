#!/bin/bash
# Process one rigged 3D asset (GLB/GLTF/FBX, with or without animation) into
# the model's inputs: <OUTPUT_DIR>/cond.npy (its topology condition),
# <OUTPUT_DIR>/<name>.glb (its canonical asset) and <OUTPUT_DIR>/preview.png
# (facing and joint labels to check), through the same export,
# joint-annotation and feature code as the dataset pipeline
# (data_process/rig_preprocess, see its AGENTS.md). The output directory is
# then an asset for sampling: python -m unimate.inference.sample --asset <OUTPUT_DIR>.
#
# Usage:
#   INPUT=my_robot.glb OUTPUT_DIR=outputs/my_robot bash data_process/scripts/run_rig_preprocess.sh
#   INPUT=rig.fbx OUTPUT_DIR=out FACE_R=R_Thigh FACE_L=L_Thigh bash data_process/scripts/run_rig_preprocess.sh
#   INPUT="dataset/raw/truebones/animation/Dog-*.fbx" PROFILE=truebones ANNOTATE=dataset \
#       OUTPUT_DIR=out/Dog bash data_process/scripts/run_rig_preprocess.sh -- --keep_intermediate
#   VERIFY=1 ...   # then compare the output with the dataset's copy (training assets)
#   # by default a run stops before the cond: check out/annotation.json (see out/REVIEW.md), then
#   ANNOTATION=out/annotation.json INPUT=rig.glb OUTPUT_DIR=out bash data_process/scripts/run_rig_preprocess.sh
#   REVIEW=0 INPUT=rig.glb OUTPUT_DIR=out bash data_process/scripts/run_rig_preprocess.sh   # build directly
#
# Env overrides:
#   INPUT        (required) the asset file; a glob or space-separated list for
#                PROFILE=truebones (one species' clip FBXs); no spaces in paths
#   OUTPUT_DIR   (required)
#   PROFILE      auto (default: truebones for several {Species}-{Action}.fbx clips;
#                with ANNOTATE=dataset, the dataset of --dataset_export_dir, passed after --;
#                else general) | general | objaverse | truebones: the dataset whose
#                processing to reproduce
#   ANNOTATE     llm | rule | dataset: joint-name / facing source (default: llm when
#                DEEPSEEK_API_KEY / OPENAI_API_KEY is set for the model, else rule;
#                rule when ANNOTATION, ANNOTATE_NAMES or ANNOTATE_FACE is given)
#   ANNOTATE_NAMES, ANNOTATE_FACE  rule | llm: one source differing from ANNOTATE
#                (not with ANNOTATE=dataset), e.g. ANNOTATE_FACE=llm for rule names
#                with an LLM-chosen face pair
#   NAME         object type for the asset (default: from its file name)
#   FACE_R, FACE_L  raw names of the facing pair (overrides the annotation);
#                BODY_AXIS=1 when it is a head / tail axis
#   EXP_DIR      training run whose joint width (config.json) the asset is checked
#                against (default: the released UniML3D models' width, 71)
#   FORMATS      canonical asset files: glb (default) or glb,fbx
#   SAVE_CLIPS   1: keep the feature clips in <OUTPUT_DIR>/motions/ (ground truth
#                for in-betweening / motion editing)
#   REST_ROTATION  stand up a rest pose authored lying down / upside down, e.g. x180,
#                x90, x-90 (preview.png and summary.json notes show when it is needed)
#   REVIEW       1 / 0: stop after the annotation, before the cond, and write
#                annotation.json, annotation_preview.png and REVIEW.md to check the
#                joint labels and the facing pair (by hand, or with an LLM / agent) /
#                build directly. Default: review, except with ANNOTATION or ANNOTATE=dataset
#   ANNOTATION   a reviewed annotation.json: its labels and facing pair replace the
#                annotation, and the run continues to the cond
#   VERIFY       1: run `verify` afterwards when the asset was built (exit 1 on a difference)
#   CONDA_ENV    conda environment to activate (default: unimate)
# Arguments after `--` go to `python -m data_process.rig_preprocess run`
# (--keep_intermediate, --overwrite, LLM options, ...).

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

handle_help "$@"
[[ "${1:-}" == "--" ]] && shift

INPUT=${INPUT:?Set INPUT to the asset file}
OUTPUT_DIR=${OUTPUT_DIR:?Set OUTPUT_DIR}
read -r -a INPUTS <<< "$INPUT"
# shellcheck disable=SC2206
INPUTS=(${INPUTS[@]})          # expand globs

ARGS=(--input "${INPUTS[@]}" --output_dir "$OUTPUT_DIR"
      --profile "${PROFILE:-auto}" ${ANNOTATE:+--annotate "$ANNOTATE"})
[[ -n "${FORMATS:-}" ]] && ARGS+=(--formats "$FORMATS")
[[ "${SAVE_CLIPS:-0}" == 1 ]] && ARGS+=(--save_clips)
[[ -n "${REST_ROTATION:-}" ]] && ARGS+=(--rest_rotation "$REST_ROTATION")
[[ -n "${ANNOTATE_NAMES:-}" ]] && ARGS+=(--annotate_names "$ANNOTATE_NAMES")
[[ -n "${ANNOTATE_FACE:-}" ]] && ARGS+=(--annotate_face "$ANNOTATE_FACE")
[[ -n "${NAME:-}" ]] && ARGS+=(--name "$NAME")
[[ -n "${EXP_DIR:-}" ]] && ARGS+=(--exp_dir "$EXP_DIR")
[[ -n "${FACE_R:-}" ]] && ARGS+=(--face_r "$FACE_R")
[[ -n "${FACE_L:-}" ]] && ARGS+=(--face_l "$FACE_L")
[[ "${BODY_AXIS:-0}" == 1 ]] && ARGS+=(--body_axis)
[[ "${REVIEW:-}" == 1 ]] && ARGS+=(--review)
[[ "${REVIEW:-}" == 0 ]] && ARGS+=(--no_review)
[[ -n "${ANNOTATION:-}" ]] && ARGS+=(--annotation "$ANNOTATION")

python -m data_process.rig_preprocess run "${ARGS[@]}" "$@"
if [[ "${VERIFY:-0}" == 1 && -f "$OUTPUT_DIR/cond.npy" ]]; then
    python -m data_process.rig_preprocess verify --output_dir "$OUTPUT_DIR"
fi
