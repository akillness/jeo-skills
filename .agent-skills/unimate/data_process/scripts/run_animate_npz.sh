#!/bin/bash
# Stage 5 — drive a rigged character with an *exported* motion NPZ (stage-1
# format) and save the animated character as GLB/FBX.
#
# Usage:
#   CHAR_PATH=char.glb ANIM_PATH=clip.npz bash data_process/scripts/run_animate_npz.sh
#   ANIM_PATH=dataset/export/truebones/motions/Dog-Walk.npz DATASET_TYPE=truebones \
#       bash data_process/scripts/run_animate_npz.sh      # -> export/truebones/rigs/Dog.glb
#
# Env overrides:
#   CHAR_PATH      rigged character GLB/FBX matching the NPZ skeleton; optional
#                  with DATASET_TYPE: the processed export asset of the clip
#   DATASET_TYPE   truebones|objaverse|mixamo|general (to resolve CHAR_PATH)
#   CHARACTER      Mixamo character for that (default Michelle)
#   ANIM_PATH      (required — NPZ whose skeleton matches the rig)
#   OUTPUT_DIR     (default: outputs/animated)
#   CHAR_ANIM_TYPE glb|fbx (default: glb)
#   EXTRA_BONES_STRATEGY merge|remove|keep for armature bones absent from the
#                  NPZ (default: merge, see animate_npz.py)

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

handle_help "$@"

if [[ -z "${CHAR_PATH:-}" && -z "${DATASET_TYPE:-}" ]]; then
    echo "Set CHAR_PATH, or DATASET_TYPE to use the processed export asset of the clip" >&2
    exit 1
fi
ANIM_PATH=${ANIM_PATH:?Set ANIM_PATH to a motion NPZ matching the rig}
OUTPUT_DIR=${OUTPUT_DIR:-outputs/animated}
CHAR_ANIM_TYPE=${CHAR_ANIM_TYPE:-glb}

EXTRA_ARGS=()
[[ -n "${CHAR_PATH:-}" ]] && EXTRA_ARGS+=(--char_path="$CHAR_PATH")
[[ -n "${DATASET_TYPE:-}" ]] && EXTRA_ARGS+=(--dataset_type="$DATASET_TYPE")
[[ -n "${CHARACTER:-}" ]] && EXTRA_ARGS+=(--character="$CHARACTER")
[[ -n "${EXTRA_BONES_STRATEGY:-}" ]] && EXTRA_ARGS+=(--extra_bones_strategy="$EXTRA_BONES_STRATEGY")

blender -b --python-exit-code 1 -P data_process/mesh_animation/animate_npz.py -- \
    --anim_path="$ANIM_PATH" \
    --output_dir="$OUTPUT_DIR" \
    --char_anim_type="$CHAR_ANIM_TYPE" "${EXTRA_ARGS[@]}" "$@"
