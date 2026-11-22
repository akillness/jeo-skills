#!/bin/bash
# Stage 5 — drive a rigged character with a canonicalized motion clip (stage-4
# format, or a generated motion in that format) and export GLB + FBX. The
# character is auto-resolved from the dataset + clip name (Mixamo clips carry
# no object type, so there it is CHARACTER, default Michelle):
#   ASSET=canonical (default): the canonical asset (dataset/canonical_assets/<ds>/),
#       motion kept at canonical scale; an object type without one falls back
#       to the export resolution with a warning.
#   ASSET=export: the processed GLB (dataset/export/<ds>/rigs/, from
#       `run_export.sh <ds> --glb_only`) when one exists, else the raw asset
#       (Mixamo: rigs/<CHARACTER>.glb, else, for the default character only,
#       the raw Y_Bot.fbx), motion scaled
#       back to the export's units.
#
# Usage:
#   ANIM_PATH=sample.npy bash data_process/scripts/run_animate_motion.sh objaverse
#   ANIM_PATH=clip.npz bash data_process/scripts/run_animate_motion.sh truebones
#   ANIM_PATH=clip.npz CHARACTER=Abe bash data_process/scripts/run_animate_motion.sh mixamo
#   ANIM_PATH=clip.npz ASSET=export bash data_process/scripts/run_animate_motion.sh truebones
#
# Env overrides:
#   ANIM_PATH   (required) motion .npz, or a .npy of model motion features
#   CHAR_PATH   character mesh (default: auto-resolved, above)
#   CHARACTER   Mixamo character (default Michelle)
#   ASSET       canonical (default) | export, see above
#   CANONICAL   1: require the canonical asset (no export fallback);
#               0: same as ASSET=export
#   COND_PATH   cond.npy (default: dataset/features/<dataset>/cond.npy)
#   OUTPUT_DIR  (default: outputs/animated)
#   ANIM_MODE   fk|ik, .npy input only (default: fk)
#   EXTRA_BONES_STRATEGY  merge|remove|keep for armature bones absent from the
#               motion (default: merge, see animate_motion.py)

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

handle_help "$@"

DATASET=${1:?Usage: run_animate_motion.sh <truebones|mixamo|objaverse|general> [extra args...]}
shift
require_dataset "$DATASET"

ANIM_PATH=${ANIM_PATH:?Set ANIM_PATH to a motion .npz/.npy for dataset=$DATASET}
OUTPUT_DIR=${OUTPUT_DIR:-outputs/animated}
ANIM_MODE=${ANIM_MODE:-fk}

EXTRA_ARGS=()
[[ -n "${CHARACTER:-}" ]] && EXTRA_ARGS+=(--character="$CHARACTER")
ASSET=${ASSET:-canonical}
case "${CANONICAL:-}" in
    1) ASSET=canonical; EXTRA_ARGS+=(--canonical) ;;
    0) ASSET=export ;;
esac
EXTRA_ARGS+=(--asset="$ASSET")
[[ -n "${CHAR_PATH:-}" ]] && EXTRA_ARGS+=(--char_path="$CHAR_PATH")
[[ -n "${COND_PATH:-}" ]] && EXTRA_ARGS+=(--cond_path="$COND_PATH")
[[ -n "${EXTRA_BONES_STRATEGY:-}" ]] && EXTRA_ARGS+=(--extra_bones_strategy="$EXTRA_BONES_STRATEGY")

blender -b --python-exit-code 1 -P data_process/mesh_animation/animate_motion.py -- \
    --dataset_type="$DATASET" \
    --anim_path="$ANIM_PATH" \
    --output_dir="$OUTPUT_DIR" \
    --anim_mode="$ANIM_MODE" \
    "${EXTRA_ARGS[@]}" "$@"
