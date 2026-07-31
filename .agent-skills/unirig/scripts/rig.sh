#!/usr/bin/env bash
# unirig pipeline wrapper: skeleton -> skin -> merge
#
# Thin, honest wrapper over the upstream launch scripts in $UNIRIG_HOME/launch/inference.
# It validates inputs, derives intermediate artifacts, runs stages in order, and fails when
# an expected output file was not produced.
#
# Usage:
#   bash scripts/rig.sh --input model.glb --output out/model_rigged.glb [--dry-run]
#   bash scripts/rig.sh --stage skeleton --input model.glb --output out/model_skeleton.fbx
#   bash scripts/rig.sh --stage skin --input out/model_skeleton.fbx --output out/model_skin.fbx
#   bash scripts/rig.sh --stage merge --source out/model_skin.fbx --target model.glb \
#        --output out/model_rigged.glb
#   bash scripts/rig.sh --stage skeleton --input-dir assets/ --output-dir out/
#
# Env knobs:
#   UNIRIG_HOME=<path>   UniRig checkout (default: ~/.cache/unirig/UniRig)

set -euo pipefail

UNIRIG_HOME="${UNIRIG_HOME:-$HOME/.cache/unirig/UniRig}"
STAGE="all"
INPUT=""
INPUT_DIR=""
OUTPUT=""
OUTPUT_DIR=""
SOURCE=""
TARGET=""
SKELETON_OUT=""
SKIN_OUT=""
SEED=""
FACES=""
NUM_RUNS=""
ADD_ROOT=""
FORCE_OVERRIDE=""
SKELETON_TASK=""
SKIN_TASK=""
REQUIRE_SUFFIX="obj,fbx,FBX,dae,glb,gltf,vrm"
DRY_RUN=0

die() { printf '\033[1;31m[unirig]\033[0m %s\n' "$*" >&2; exit 2; }
log() { printf '\033[1;34m[unirig]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[unirig]\033[0m %s\n' "$*" >&2; }

usage() { sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; }

while (($# > 0)); do
  case "$1" in
    --stage) STAGE="${2:?--stage needs a value}"; shift 2 ;;
    --input) INPUT="${2:?}"; shift 2 ;;
    --input-dir) INPUT_DIR="${2:?}"; shift 2 ;;
    --output) OUTPUT="${2:?}"; shift 2 ;;
    --output-dir) OUTPUT_DIR="${2:?}"; shift 2 ;;
    --source) SOURCE="${2:?}"; shift 2 ;;
    --target) TARGET="${2:?}"; shift 2 ;;
    --skeleton-out) SKELETON_OUT="${2:?}"; shift 2 ;;
    --skin-out) SKIN_OUT="${2:?}"; shift 2 ;;
    --seed) SEED="${2:?}"; shift 2 ;;
    --faces-target-count) FACES="${2:?}"; shift 2 ;;
    --num-runs) NUM_RUNS="${2:?}"; shift 2 ;;
    --add-root) ADD_ROOT="${2:?}"; shift 2 ;;
    --force-override) FORCE_OVERRIDE="${2:?}"; shift 2 ;;
    --skeleton-task) SKELETON_TASK="${2:?}"; shift 2 ;;
    --skin-task) SKIN_TASK="${2:?}"; shift 2 ;;
    --require-suffix) REQUIRE_SUFFIX="${2:?}"; shift 2 ;;
    --unirig-home) UNIRIG_HOME="${2:?}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1 (see --help)" ;;
  esac
done

case "$STAGE" in
  all|skeleton|skin|merge) ;;
  *) die "Unknown --stage '$STAGE' (all|skeleton|skin|merge)" ;;
esac

# ---- checkout ----
if [ ! -d "$UNIRIG_HOME" ] || [ ! -f "$UNIRIG_HOME/launch/inference/generate_skeleton.sh" ]; then
  if [ "$DRY_RUN" = "1" ]; then
    warn "UniRig checkout not found at $UNIRIG_HOME — printing the plan only."
  else
    die "UniRig checkout not found at $UNIRIG_HOME. Run: bash scripts/install.sh --repo-only"
  fi
fi

suffix_supported() { # <path>
  local ext="${1##*.}"
  case ",$REQUIRE_SUFFIX," in
    *",$ext,"*) return 0 ;;
    *) return 1 ;;
  esac
}

require_readable() { # <path> <label>
  if [ ! -f "$1" ]; then
    if [ "$DRY_RUN" = "1" ]; then
      warn "$2 does not exist yet: $1"
    else
      die "$2 not found: $1"
    fi
  fi
}

ensure_parent() { # <path>
  local dir
  dir="$(dirname "$1")"
  [ -d "$dir" ] && return 0
  if [ "$DRY_RUN" = "1" ]; then
    log "would create directory $dir"
  else
    mkdir -p "$dir"
  fi
}

run() { # prints, then executes unless --dry-run
  printf '\033[1;36m$\033[0m (cd %s && %s)\n' "$UNIRIG_HOME" "$*"
  [ "$DRY_RUN" = "1" ] && return 0
  (cd "$UNIRIG_HOME" && "$@")
}

expect_artifact() { # <path> <label>
  [ "$DRY_RUN" = "1" ] && return 0
  [ -s "$1" ] || die "$2 was not produced: $1 (upstream stage reported no usable output)"
  log "$2 ready: $1"
}

abspath() { # keep paths valid after `cd $UNIRIG_HOME`
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s\n' "$PWD/$1" ;;
  esac
}

# ---- optional venv ----
if [ -f "$UNIRIG_HOME/.venv/bin/activate" ]; then
  # shellcheck disable=SC1091
  . "$UNIRIG_HOME/.venv/bin/activate"
  log "activated $UNIRIG_HOME/.venv"
fi

# ---- shared upstream flags ----
common_flags() {
  local -a f=(--require_suffix "$REQUIRE_SUFFIX")
  [ -n "$NUM_RUNS" ] && f+=(--num_runs "$NUM_RUNS")
  [ -n "$FACES" ] && f+=(--faces_target_count "$FACES")
  [ -n "$FORCE_OVERRIDE" ] && f+=(--force_override "$FORCE_OVERRIDE")
  [ -n "$SEED" ] && f+=(--seed "$SEED")
  printf '%s\n' "${f[@]}"
}

stage_skeleton() { # <in-file|""> <in-dir|""> <out-file|""> <out-dir|"">
  local in_file="$1" in_dir="$2" out_file="$3" out_dir="$4"
  local -a cmd=(bash launch/inference/generate_skeleton.sh)
  while IFS= read -r flag; do cmd+=("$flag"); done < <(common_flags)
  [ -n "$SKELETON_TASK" ] && cmd+=(--skeleton_task "$SKELETON_TASK")
  [ -n "$ADD_ROOT" ] && cmd+=(--add_root "$ADD_ROOT")
  [ -n "$in_file" ] && cmd+=(--input "$(abspath "$in_file")")
  [ -n "$in_dir" ] && cmd+=(--input_dir "$(abspath "$in_dir")")
  [ -n "$out_file" ] && cmd+=(--output "$(abspath "$out_file")")
  [ -n "$out_dir" ] && cmd+=(--output_dir "$(abspath "$out_dir")")
  log "stage 1/3 skeleton"
  run "${cmd[@]}"
}

stage_skin() { # <in-file|""> <in-dir|""> <out-file|""> <out-dir|"">
  local in_file="$1" in_dir="$2" out_file="$3" out_dir="$4"
  local -a cmd=(bash launch/inference/generate_skin.sh)
  while IFS= read -r flag; do cmd+=("$flag"); done < <(common_flags)
  [ -n "$SKIN_TASK" ] && cmd+=(--skin_task "$SKIN_TASK")
  [ -n "$in_file" ] && cmd+=(--input "$(abspath "$in_file")")
  [ -n "$in_dir" ] && cmd+=(--input_dir "$(abspath "$in_dir")")
  [ -n "$out_file" ] && cmd+=(--output "$(abspath "$out_file")")
  [ -n "$out_dir" ] && cmd+=(--output_dir "$(abspath "$out_dir")")
  log "stage 2/3 skin"
  run "${cmd[@]}"
}

stage_merge() { # <source> <target> <output>
  log "stage 3/3 merge"
  case "$1" in
    *_skeleton.fbx)
      warn "merging a *_skeleton.fbx produces an armature WITHOUT skinning weights."
      warn "Use the *_skin.fbx from the skin stage for a deformable rig."
      ;;
  esac
  run bash launch/inference/merge.sh \
    --require_suffix "$REQUIRE_SUFFIX" \
    --source "$(abspath "$1")" \
    --target "$(abspath "$2")" \
    --output "$(abspath "$3")"
}

# ---- directory mode ----
if [ -n "$INPUT_DIR" ]; then
  [ -n "$INPUT" ] && die "Use either --input or --input-dir, not both"
  [ -n "$OUTPUT_DIR" ] || die "--input-dir requires --output-dir"
  case "$STAGE" in
    skeleton|skin) ;;
    *)
      die "Directory mode supports --stage skeleton or --stage skin. Upstream merge.sh takes one
--source/--target pair, so merge per file, e.g.:
  for f in \"$INPUT_DIR\"/*.glb; do
    b=\$(basename \"\${f%.*}\")
    bash scripts/rig.sh --stage merge --source \"$OUTPUT_DIR/\$b.fbx\" --target \"\$f\" \\
      --output \"$OUTPUT_DIR/\$b\"_rigged.glb
  done" ;;
  esac
  [ -d "$INPUT_DIR" ] || [ "$DRY_RUN" = "1" ] || die "--input-dir not found: $INPUT_DIR"
  [ "$DRY_RUN" = "1" ] || mkdir -p "$OUTPUT_DIR"
  if [ "$STAGE" = "skeleton" ]; then
    stage_skeleton "" "$INPUT_DIR" "" "$OUTPUT_DIR"
  else
    stage_skin "" "$INPUT_DIR" "" "$OUTPUT_DIR"
  fi
  log "done (directory mode, stage: $STAGE)"
  exit 0
fi

# ---- single-file modes ----
case "$STAGE" in
  merge)
    [ -n "$SOURCE" ] && [ -n "$TARGET" ] && [ -n "$OUTPUT" ] \
      || die "--stage merge requires --source, --target and --output"
    require_readable "$SOURCE" "merge source"
    require_readable "$TARGET" "merge target"
    suffix_supported "$TARGET" || die "unsupported target suffix: $TARGET (allowed: $REQUIRE_SUFFIX)"
    ensure_parent "$OUTPUT"
    stage_merge "$SOURCE" "$TARGET" "$OUTPUT"
    expect_artifact "$OUTPUT" "rigged asset"
    ;;

  skeleton)
    [ -n "$INPUT" ] && [ -n "$OUTPUT" ] || die "--stage skeleton requires --input and --output"
    require_readable "$INPUT" "input model"
    suffix_supported "$INPUT" || die "unsupported input suffix: $INPUT (allowed: $REQUIRE_SUFFIX)"
    ensure_parent "$OUTPUT"
    stage_skeleton "$INPUT" "" "$OUTPUT" ""
    expect_artifact "$OUTPUT" "skeleton"
    ;;

  skin)
    [ -n "$INPUT" ] && [ -n "$OUTPUT" ] || die "--stage skin requires --input and --output"
    require_readable "$INPUT" "skeleton file"
    suffix_supported "$INPUT" || die "unsupported input suffix: $INPUT (allowed: $REQUIRE_SUFFIX)"
    ensure_parent "$OUTPUT"
    stage_skin "$INPUT" "" "$OUTPUT" ""
    expect_artifact "$OUTPUT" "skin"
    ;;

  all)
    [ -n "$INPUT" ] && [ -n "$OUTPUT" ] || die "--stage all requires --input and --output"
    require_readable "$INPUT" "input model"
    suffix_supported "$INPUT" || die "unsupported input suffix: $INPUT (allowed: $REQUIRE_SUFFIX)"
    ensure_parent "$OUTPUT"
    # intermediates are named after the INPUT asset, matching upstream's
    # giraffe.glb -> giraffe_skeleton.fbx / giraffe_skin.fbx convention
    base="$(basename "$INPUT")"; base="${base%.*}"
    outdir="$(dirname "$OUTPUT")"
    [ -n "$SKELETON_OUT" ] || SKELETON_OUT="$outdir/${base}_skeleton.fbx"
    [ -n "$SKIN_OUT" ] || SKIN_OUT="$outdir/${base}_skin.fbx"
    stage_skeleton "$INPUT" "" "$SKELETON_OUT" ""
    expect_artifact "$SKELETON_OUT" "skeleton"
    stage_skin "$SKELETON_OUT" "" "$SKIN_OUT" ""
    expect_artifact "$SKIN_OUT" "skin"
    stage_merge "$SKIN_OUT" "$INPUT" "$OUTPUT"
    expect_artifact "$OUTPUT" "rigged asset"
    ;;
esac

if [ "$DRY_RUN" = "1" ]; then
  log "dry run only — nothing was executed"
else
  case "$OUTPUT" in
    *.glb|*.gltf)
      log "verify with: python3 $(dirname "$0")/inspect_glb.py $OUTPUT"
      ;;
    *)
      log "verify FBX output in Blender (see references/route-outs-and-troubleshooting.md)"
      ;;
  esac
fi
