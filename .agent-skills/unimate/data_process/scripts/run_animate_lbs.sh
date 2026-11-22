#!/bin/bash
# Stage 5 — deform a rigged asset with a motion NPZ via manual NumPy LBS and
# save the animated rigged asset (GLB by default; FBX, vertex NPZ and per-frame
# OBJ on request, SAVE).
#
# Accepts both motion flavors (auto-detected): export-stage NPZ, or
# feature-format NPZ — the latter through the cond (DATASET_TYPE / COND_PATH),
# or with no cond on a canonical asset (dataset/canonical_assets/<ds>/).
#
# Usage:
#   CHAR_PATH=asset.glb ANIM_PATH=clip.npz bash data_process/scripts/run_animate_lbs.sh
#   ANIM_PATH=dataset/features/truebones/motions/Dog-Walk-000.npz DATASET_TYPE=truebones \
#       bash data_process/scripts/run_animate_lbs.sh       # -> canonical_assets/truebones/Dog.glb
#   ANIM_PATH=<feature>.npz DATASET_TYPE=mixamo CHARACTER=Abe bash data_process/scripts/run_animate_lbs.sh
#
# Env overrides:
#   CHAR_PATH     rigged asset GLB/FBX with skinning weights; optional with
#                 DATASET_TYPE: the processed asset of the clip (canonical for a
#                 feature NPZ, export for an export NPZ)
#   CHARACTER     Mixamo character for that (default Michelle)
#   ANIM_PATH     (required — motion NPZ, or a directory of NPZs: one output
#                  set per action clip)
#   DATASET_TYPE  truebones|objaverse|mixamo|general: resolves CHAR_PATH when
#                 unset, and the cond of a feature NPZ on a non-canonical asset
#   COND_PATH     cond.npy override (feature-format motion only)
#   OUTPUT_DIR    (default: outputs/lbs)
#   SAVE          comma-separated: glb,fbx,npz,obj (default: glb)
#                 glb/fbx = animated rigged asset via the animate_npz keyframe path

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

handle_help "$@"

if [[ -z "${CHAR_PATH:-}" && -z "${DATASET_TYPE:-}" ]]; then
    echo "Set CHAR_PATH, or DATASET_TYPE to use the processed asset of the clip" >&2
    exit 1
fi
ANIM_PATH=${ANIM_PATH:?Set ANIM_PATH to a motion NPZ}
OUTPUT_DIR=${OUTPUT_DIR:-outputs/lbs}
SAVE=${SAVE:-glb}

EXTRA_ARGS=()
[[ -n "${CHAR_PATH:-}" ]] && EXTRA_ARGS+=(--char_path="$CHAR_PATH")
[[ -n "${CHARACTER:-}" ]] && EXTRA_ARGS+=(--character="$CHARACTER")
[[ -n "${DATASET_TYPE:-}" ]] && EXTRA_ARGS+=(--dataset_type="$DATASET_TYPE")
[[ -n "${COND_PATH:-}" ]] && EXTRA_ARGS+=(--cond_path="$COND_PATH")

blender -b --python-exit-code 1 -P data_process/mesh_animation/animate_lbs.py -- \
    --anim_path="$ANIM_PATH" \
    --output_dir="$OUTPUT_DIR" \
    --save="$SAVE" \
    "${EXTRA_ARGS[@]}" "$@"
