#!/bin/bash
# Stage 1 — export raw rigged assets (GLB/GLTF and FBX) to NPZ motion data.
#
# Usage:
#   bash data_process/scripts/run_export.sh truebones           # dataset preset (flat {Species}-{Action}.fbx clips)
#   bash data_process/scripts/run_export.sh mixamo              # dataset preset (animation-only FBX)
#   bash data_process/scripts/run_export.sh objaverse           # dataset preset (GLB/GLTF)
#   bash data_process/scripts/run_export.sh objaverse --multi-worker 8   # parallel (mixamo too)
#   bash data_process/scripts/run_export.sh mixamo --multi-worker 8 --no-vis   # skip MP4 previews
#   bash data_process/scripts/run_export.sh general --multi-worker 8     # your extra assets
#   DATA_DIR=my_assets bash data_process/scripts/run_export.sh general   # ... from another folder
#   bash data_process/scripts/run_export.sh truebones --save_glb   # + rigs/<asset>.glb (rest pose, no animation)
#   bash data_process/scripts/run_export.sh truebones --glb_only   # only add missing GLBs to an existing export
#
# --multi-worker only applies to a *directory* input; truebones is exported by
# a single-process exporter and ignores it (with a warning), except under
# --glb_only, which shards its species.
#
# general is extra training data of your own: one rigged asset per file in
# dataset/raw/general/animation/ (objaverse-style GLB/GLTF, each animation a
# clip; FBX side by side works too),
# exported by export_general.py to dataset/export/general. The importer is
# picked per file by extension, the mesh is optional (armature-only FBX works,
# but only meshed assets can be rendered and captioned later), and the asset
# name is the file stem with '-' and whitespace replaced by '_'. Calling the
# script without a dataset (or with `auto`, an alias) means general.
#
# Env overrides: DATA_DIR, OUTPUT_DIR, CHAR_DIR (mixamo: the characters whose
# GLBs --save_glb / --glb_only write; default dataset/raw/mixamo/character_refined)
# Extra arguments are passed through to the exporter.

set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

EXPORTERS=data_process/motion_export

# ── Parse mode + flags ───────────────────────────────────────────────────────
handle_help "$@"

MODE=general
case "${1:-}" in
    truebones|mixamo|objaverse|general) MODE="$1"; shift ;;
    auto) MODE=general; shift ;;   # alias of general
    ""|--*) ;;   # no dataset given: general, flags follow
    *)
        # A bare word that is not a dataset name is almost always a typo;
        # silently treating it as an exporter flag would export the general
        # dataset instead.
        echo "ERROR: unknown dataset '$1' (expected truebones | mixamo | objaverse | general)" >&2
        exit 2 ;;
esac

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

# ── Per-mode defaults ────────────────────────────────────────────────────────
case "$MODE" in
    truebones)
        DATA_DIR=${DATA_DIR:-dataset/raw/truebones/animation}
        OUTPUT_DIR=${OUTPUT_DIR:-$(export_dir truebones)} ;;
    mixamo)
        DATA_DIR=${DATA_DIR:-dataset/raw/mixamo/animation_motion}
        OUTPUT_DIR=${OUTPUT_DIR:-$(export_dir mixamo)}
        # The characters the processed GLBs are made of (--save_glb / --glb_only).
        CHAR_DIR=${CHAR_DIR:-dataset/raw/mixamo/character_refined} ;;
    objaverse)
        DATA_DIR=${DATA_DIR:-dataset/raw/objaverse/glb}
        OUTPUT_DIR=${OUTPUT_DIR:-$(export_dir objaverse)} ;;
    general)
        DATA_DIR=${DATA_DIR:-$GENERAL_RAW_DIR}
        OUTPUT_DIR=${OUTPUT_DIR:-$(export_dir general)}
        if [[ ! -e "$DATA_DIR" ]]; then
            echo "ERROR: $DATA_DIR does not exist; put your rigged assets there" \
                 "(one .glb per object) or set DATA_DIR." >&2
            exit 2
        fi
        if [[ "$(realpath -m "$DATA_DIR")" != "$(realpath -m "$GENERAL_RAW_DIR")" ]]; then
            echo "NOTE: general assets from $DATA_DIR: pass the same DATA_DIR to" \
                 "run_render_motion.sh and run_render_tpose.sh, which read $GENERAL_RAW_DIR" \
                 "by default (a clip without renders gets no caption and stage 4 drops it)."
        fi ;;
esac

# ── Exporter invocations ─────────────────────────────────────────────────────
# launch_workers <script> <input flag>: run one exporter, sharding over
# NUM_WORKERS parallel Blender processes and merging the per-worker summary
# JSONs afterwards. Only a directory input is sharded — the exporters write
# unsuffixed canonical summaries for a single file, which N workers would
# concurrently overwrite.
launch_workers() {
    local script="$1" input_flag="$2"
    if [[ "$NUM_WORKERS" -gt 1 && -d "$DATA_DIR" ]]; then
        local log_dir
        log_dir=$(worker_log_dir "export-$MODE")
        echo "Launching $NUM_WORKERS export workers (per-worker logs: $log_dir)..."
        local pids=() worker_id failed=0
        for worker_id in $(seq 0 $((NUM_WORKERS - 1))); do
            blender -b --python-exit-code 1 -P "$EXPORTERS/$script" -- \
                "$input_flag=$DATA_DIR" --output_dir="$OUTPUT_DIR" \
                --worker_id="$worker_id" --num_workers="$NUM_WORKERS" \
                "${EXTRA_ARGS[@]}" > >(tee "$log_dir/worker${worker_id}.log") 2>&1 &
            pids+=($!)
            echo "  Started worker $worker_id (PID ${pids[-1]})"
        done

        # A bare `wait` always returns 0 — check every worker individually.
        # Merging a truncated set of shards would silently shrink the
        # canonical JSONs and then delete the shards, so never merge on failure.
        for worker_id in "${!pids[@]}"; do
            wait "${pids[worker_id]}" \
                || { echo "Worker $worker_id failed (log: $log_dir/worker${worker_id}.log)" >&2; failed=1; }
        done
        if [[ $failed -ne 0 ]]; then
            echo "Some export workers failed — NOT merging summary JSONs." >&2
            echo "Per-worker shards are preserved in $OUTPUT_DIR; rerun to finish," >&2
            echo "then merge with: python -m data_process.tools.merge_summaries --output_dir=$OUTPUT_DIR" >&2
            exit 1
        fi
        if [[ "$GLB_ONLY" == 1 ]]; then
            echo "All workers finished (--glb_only: no summaries to merge)."
            return
        fi
        echo "All workers finished. Merging summary JSONs..."
        python -m data_process.tools.merge_summaries --output_dir="$OUTPUT_DIR"
    else
        if [[ "$NUM_WORKERS" -gt 1 ]]; then
            echo "WARNING: --multi-worker is ignored for a single-file input" \
                 "($DATA_DIR); running one exporter process." >&2
        fi
        blender -b --python-exit-code 1 -P "$EXPORTERS/$script" -- \
            "$input_flag=$DATA_DIR" --output_dir="$OUTPUT_DIR" "${EXTRA_ARGS[@]}"
    fi
}

export_glb()    { launch_workers export_objaverse.py --data_dir; }
export_mixamo() {
    case " ${EXTRA_ARGS[*]} " in
        # Default first: an explicit --char_dir later in the arguments wins.
        *" --save_glb "*|*" --glb_only "*) EXTRA_ARGS=(--char_dir="$CHAR_DIR" "${EXTRA_ARGS[@]}") ;;
    esac
    launch_workers export_mixamo.py --anim_dir
}

export_fbx() {
    # A GLB-only run writes per-clip files only, so its species can be sharded.
    if [[ "$GLB_ONLY" == 1 && "$NUM_WORKERS" -gt 1 ]]; then
        launch_workers export_truebones.py --data_dir
        return
    fi
    if [[ "$NUM_WORKERS" -gt 1 ]]; then
        echo "WARNING: --multi-worker is ignored for truebones — export_truebones.py" \
             "is single-process; running one exporter process (except with --glb_only)." >&2
    fi
    blender -b --python-exit-code 1 -P "$EXPORTERS/export_truebones.py" -- \
        --data_dir="$DATA_DIR" --output_dir="$OUTPUT_DIR" "$@" "${EXTRA_ARGS[@]}"
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
echo "Mode: $MODE | Input: $DATA_DIR | Output: $OUTPUT_DIR"
case "$MODE" in
    objaverse) export_glb ;;
    mixamo)    export_mixamo ;;
    truebones) export_fbx ;;
    general)   launch_workers export_general.py --input ;;
esac
