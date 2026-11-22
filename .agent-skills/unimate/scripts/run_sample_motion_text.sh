#!/bin/bash
# Text-conditioned sampling from a trained UniMate run.
#
# Usage:
#   bash scripts/run_sample_motion_text.sh <exp_dir> [test_cases_json] [cfg_scale]
#   ASSETS=outputs/rig/robot PROMPT="An object walks forward." bash scripts/run_sample_motion_text.sh <exp_dir>
#
# Arguments:
#   exp_dir          training output directory (config.json, dataset_stats.npy, checkpoints/)
#   test_cases_json  {"<asset>-<case_id>": "prompt"} or a list of {"asset", "prompt",
#                    "id"} entries; omit (or pass "") with ASSETS + PROMPT, or to
#                    enumerate the dataset's eval split (its train prompts when
#                    there is none)
#   cfg_scale        classifier-free guidance scale (default: value saved in the run's config)
#
# Env overrides:
#   REPLICATE             samples per test case (default: 3)
#   SEED                  integer seed for deterministic noise (default: unset)
#   ASSETS                space-separated asset references (--asset): rig_preprocess
#                         output directories, one-entry cond.npy files,
#                         <dataset>:<object_type> or names
#   PROMPT                prompts sampled on every ASSETS entry, separated by '|' (--prompt)
#   COND_PATH             space-separated cond.npy files whose entries the test cases
#                         may name (--cond_path)
#   COND_DATASET_TYPE     dataset whose stats normalize assets that are not dataset
#                         object types (--cond_dataset_type)
#   OUTPUT_DIR            (default: <exp_dir>/samples[_<test_cases stem>])
#   CONDA_ENV             conda environment to activate (default: unimate)
#   CUDA_VISIBLE_DEVICES  GPU to use (default: the one with the most free memory)

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
handle_help "$@"

EXP_DIR=${1:?Usage: run_sample_motion_text.sh <exp_dir> [test_cases_json] [cfg_scale]}
TEST_CASES=${2:-}
CFG_SCALE=${3:-}
REPLICATE=${REPLICATE:-3}
SEED=${SEED:-}

TEST_NAME=${TEST_CASES:+$(basename "${TEST_CASES%.json}")}
OUTPUT_DIR=${OUTPUT_DIR:-$EXP_DIR/samples${TEST_NAME:+_$TEST_NAME}}

select_gpu
echo "Exp dir:    $EXP_DIR"
if [[ -n "$TEST_CASES" ]]; then CASES_DESC=$TEST_CASES
elif [[ -n "${PROMPT:-}" ]]; then CASES_DESC="<ASSETS + PROMPT>"
elif [[ -n "${ASSETS:-}" ]]; then CASES_DESC="<ASSETS, unconditional: needs cfg_scale 1 (pass PROMPT otherwise)>"
else CASES_DESC="<dataset split>"; fi
echo "Test cases: $CASES_DESC"
echo "Cfg scale:  ${CFG_SCALE:-<config default>}"
echo "Replicate:  $REPLICATE"
echo "Output dir: $OUTPUT_DIR"

CMD=(python -m unimate.inference.sample
     --exp_dir "$EXP_DIR" --output_dir "$OUTPUT_DIR" --num_repetitions "$REPLICATE")
[[ -n "$TEST_CASES" ]] && CMD+=(--test_cases_json "$TEST_CASES")
[[ -n "$CFG_SCALE" ]]  && CMD+=(--cfg_scale "$CFG_SCALE")
[[ -n "$SEED" ]]       && CMD+=(--seed "$SEED")

add_asset_args
add_prompt_args

"${CMD[@]}"
