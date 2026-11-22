#!/bin/bash
# Stage 1 — export rigged GLB/GLTF/FBX assets to NPZ motion data.
# Input is a single file or a directory of assets (mixed formats welcome).
# Mesh optional (armature-only FBX works); every pose action becomes a clip.
# `run_export.sh general` is the same exporter on dataset/raw/general/animation/,
# the general dataset's inputs: only files there are rendered, captioned and
# extracted by the later stages, so an input inside that directory exports
# into dataset/export/general and any other input into a one-off
# dataset/export/custom.
#
# Usage:
#   bash data_process/scripts/run_export_general.sh <asset.glb|.fbx|dir> [extra args...]
#   bash data_process/scripts/run_export_general.sh my_assets/ --multi-worker 8 --no-vis
#   OUTPUT_DIR=outputs/my_export bash data_process/scripts/run_export_general.sh model.fbx --no-prune
#
# Env overrides: OUTPUT_DIR (default above)

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

handle_help "$@"
INPUT="${1:?Usage: run_export_general.sh <asset.glb|.fbx|dir> [extra args...]}"
shift
if [[ -z "${OUTPUT_DIR:-}" ]]; then
    case "$(realpath -m "$INPUT")/" in
        "$(realpath -m "$GENERAL_RAW_DIR")"/*) OUTPUT_DIR=$(export_dir general) ;;
        *) OUTPUT_DIR=$(export_dir custom)
           echo "Input outside $GENERAL_RAW_DIR: exporting to $OUTPUT_DIR (one-off;" \
                "put the files in $GENERAL_RAW_DIR to add them to the general dataset)." ;;
    esac
fi

NUM_WORKERS=1
GLB_ONLY=0
EXTRA_ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --multi-worker) NUM_WORKERS="${2:?--multi-worker requires a value}"; shift 2 ;;
        --glb_only) GLB_ONLY=1; EXTRA_ARGS+=("$1"); shift ;;
        *) EXTRA_ARGS+=("$1"); shift ;;
    esac
done

if [[ "$NUM_WORKERS" -gt 1 && -d "$INPUT" ]]; then
    LOG_DIR=$(worker_log_dir "export-general")
    echo "Launching $NUM_WORKERS export workers (per-worker logs: $LOG_DIR)..."
    pids=()
    for worker_id in $(seq 0 $((NUM_WORKERS - 1))); do
        blender -b --python-exit-code 1 -P data_process/motion_export/export_general.py -- \
            --input="$INPUT" --output_dir="$OUTPUT_DIR" \
            --worker_id="$worker_id" --num_workers="$NUM_WORKERS" \
            "${EXTRA_ARGS[@]}" > >(tee "$LOG_DIR/worker${worker_id}.log") 2>&1 &
        pids+=($!)
        echo "  Started worker $worker_id (PID ${pids[-1]})"
    done

    # A bare `wait` always returns 0 — check every worker individually, and
    # never merge a truncated set of shards (merging deletes them).
    failed=0
    for worker_id in "${!pids[@]}"; do
        wait "${pids[worker_id]}" \
            || { echo "Worker $worker_id failed (log: $LOG_DIR/worker${worker_id}.log)" >&2; failed=1; }
    done
    if [[ $failed -ne 0 ]]; then
        echo "Some export workers failed — NOT merging summary JSONs." >&2
        echo "Per-worker shards are preserved in $OUTPUT_DIR; rerun to finish." >&2
        exit 1
    fi
    if [[ "$GLB_ONLY" == 1 ]]; then
        echo "All workers finished (--glb_only: no summaries to merge)."
    else
        echo "All workers finished. Merging summary JSONs..."
        python -m data_process.tools.merge_summaries --output_dir="$OUTPUT_DIR"
    fi
else
    if [[ "$NUM_WORKERS" -gt 1 ]]; then
        echo "WARNING: --multi-worker is ignored for a single-file input" \
             "($INPUT); running one exporter process." >&2
    fi
    blender -b --python-exit-code 1 -P data_process/motion_export/export_general.py -- \
        --input="$INPUT" --output_dir="$OUTPUT_DIR" "${EXTRA_ARGS[@]}"
fi
