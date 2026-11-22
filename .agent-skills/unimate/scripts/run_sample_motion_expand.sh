#!/bin/bash
# Motion expansion: chain several prompts into one long motion. The first
# segment is generated freely; every later segment pins its first
# EXPAND_OVERLAP frames to the previous segment's tail, and the segments are
# stitched at the seam.
#
# Usage:
#   bash scripts/run_sample_motion_expand.sh <exp_dir> <test_cases_json> [cfg_scale]
#   ASSETS=outputs/rig/robot PROMPT="An object walks forward.|An object turns left.|An object sits down." \
#       bash scripts/run_sample_motion_expand.sh <exp_dir>
#
# Arguments:
#   exp_dir          training output directory (config.json, dataset_stats.npy, checkpoints/)
#   test_cases_json  {"<asset>-<label>": ["prompt 1", "prompt 2", ...]} — one
#                    prompt per segment, in order; omit with ASSETS + PROMPT
#   cfg_scale        classifier-free guidance scale (default: value saved in the run's config)
#
# Env overrides:
#   EXPAND_OVERLAP        frames shared by consecutive segments; 0 < overlap <
#                         max_motion_length (default: 10)
#   REPLICATE             independent chains per case (default: 3)
#   SEED                  integer seed for deterministic noise (default: unset)
#   ASSETS                space-separated asset references (--asset), as in
#                         run_sample_motion_text.sh
#   PROMPT                the segments of one chain per ASSETS entry, separated by '|'
#   COND_PATH             space-separated cond.npy files whose entries the test cases
#                         may name (--cond_path)
#   COND_DATASET_TYPE     dataset whose stats normalize assets that are not dataset
#                         object types (--cond_dataset_type)
#   OUTPUT_DIR            (default: <exp_dir>/samples_<stem>_expand_o<overlap>)
#   CONDA_ENV             conda environment to activate (default: unimate)
#   CUDA_VISIBLE_DEVICES  GPU to use (default: the one with the most free memory)
#
# Results land in <OUTPUT_DIR>/motion_expand/.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
handle_help "$@"

EXP_DIR=${1:?Usage: run_sample_motion_expand.sh <exp_dir> <test_cases_json> [cfg_scale]}
TEST_CASES=${2:-}
if [[ -z "$TEST_CASES" && -z "${PROMPT:-}" ]]; then
    echo "Usage: run_sample_motion_expand.sh <exp_dir> <test_cases_json> [cfg_scale] (or ASSETS + PROMPT)" >&2
    exit 1
fi
CFG_SCALE=${3:-}
EXPAND_OVERLAP=${EXPAND_OVERLAP:-10}
REPLICATE=${REPLICATE:-3}
SEED=${SEED:-}

TEST_NAME=${TEST_CASES:+$(basename "${TEST_CASES%.json}")}
TEST_NAME=${TEST_NAME:-prompt}
OUTPUT_DIR=${OUTPUT_DIR:-$EXP_DIR/samples_${TEST_NAME}_expand_o${EXPAND_OVERLAP}}

select_gpu
echo "Exp dir:     $EXP_DIR"
echo "Test cases:  ${TEST_CASES:-<ASSETS + PROMPT>}"
echo "Cfg scale:   ${CFG_SCALE:-<config default>}"
echo "Overlap:     $EXPAND_OVERLAP"
echo "Replicate:   $REPLICATE"
echo "Output dir:  $OUTPUT_DIR/motion_expand"

CMD=(python -m unimate.inference.sample
     --exp_dir "$EXP_DIR" --output_dir "$OUTPUT_DIR" --num_repetitions "$REPLICATE"
     --motion_expand --expand_overlap "$EXPAND_OVERLAP")
[[ -n "$TEST_CASES" ]] && CMD+=(--test_cases_json "$TEST_CASES")
[[ -n "$CFG_SCALE" ]] && CMD+=(--cfg_scale "$CFG_SCALE")
[[ -n "$SEED" ]]      && CMD+=(--seed "$SEED")

add_asset_args
add_prompt_args

"${CMD[@]}"
