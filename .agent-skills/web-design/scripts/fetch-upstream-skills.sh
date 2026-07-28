#!/usr/bin/env bash
# fetch-upstream-skills.sh — Sparse-checkout MengTo/Skills' web-design
# family and copy selected sub-skill folders into the local agent skills root.
#
# This script only reads from the upstream repository (via a scratch git
# clone) and writes new files under SKILLS_ROOT. It never deletes anything
# already present at the destination.
set -euo pipefail

UPSTREAM_REPO="https://github.com/MengTo/Skills.git"
UPSTREAM_SUBDIR="agent-skills/web-design"
SKILLS_ROOT="${SKILLS_ROOT:-$HOME/.agents/skills}"

ALL_SKILLS=(
  add-shader-cursor-trail
  agency-grid-layout-minimal
  ambient-section-particles
  animation-on-scroll
  animation-systems
  atmosphere-background
  background-grid-webgl
  beam-glow-states
  beautiful-shadows
  blue-cloudy-clean-modern
  blue-laser-clean-glass-layout
  book-serif-index
  bright-green-tech-system-webgl
  build-awwwards-quality-sites
  cinematic-gsap-lenis-motion-system
  cinematic-scroll-storytelling
  clean-minimal-beige-light-mode
  cobejs
  company-logos
  container-lines
  corner-diagonals
  corner-lasers
  css-alpha-masking
  css-border-gradient
  dark-blue-contrasting-clean
  dark-glass-clean-layout
  dither-background
  dither-laser-dark-mode
  documentary-brutalist-agency
  editorial-portfolio-chapters
  editorial-service-booking
  editorial-tech
  framed-grid-layout
  framed-tech-dark-border-gradient
  funky-purple-container-tech
  glass-dark-mode-clock
  glass-dark-ui
  globe-gl
  globe-particles
  gooey-blob-system
  gsap
  gsap-scrolltrigger-storytelling
  high-contrast-skeuomorphic-clean
  image-first-grid-layout
  landing-page
  light-mode-paper-technical
  liquid-metal-border
  marquee-loop
  masked-reveal
  matterjs
  mesh-gradient-dark-blue-clean
  nested-container-clean-agency
  nested-container-frames
  number-details
  operational-enterprise-ai
  orange-clean-paper-saas
  pricing-page
  product-proof-saas
  progressive-blur
  reveal-hover-effect
  scroll-progress-timeline
  scroll-scrubbed-visual-sequence
  scroll-scrubbed-word-reveal
  scroll-world-storytelling
  shaders-cursor-ripples
  skeuomorphic-ui
  solar-duotone-bold
  split-layout-technical
  staggered-word-reveal
  tailwindcss
  tech-green-dark-mode-modern
  technical-wireframe-info-layout
  thinking-orbs
  threejs
  unicorn-studio
  vantajs
  webgl-3d-object
  webgl-landing-steering
  webgl-laser
)

DRY_RUN=0
FETCH_ALL=0
declare -a REQUESTED_SKILLS=()

usage() {
  cat <<EOF
Usage: fetch-upstream-skills.sh [options]

Sparse-checkout only ${UPSTREAM_SUBDIR} from ${UPSTREAM_REPO} and copy the
requested sub-skill folder(s) into \${SKILLS_ROOT:-\$HOME/.agents/skills}.
Existing files at the destination are never deleted; each fetched skill
folder is copied as a whole so the upstream SKILL.md stays authoritative.

Options:
  --skill <name>   Fetch one sub-skill. Repeatable (e.g. --skill a --skill b).
  --all            Fetch all 79 sub-skills in the web-design family.
  --list           Print the known sub-skill names and exit.
  --dry-run        Print what would happen without cloning or copying.
  --help           Show this help.

Environment:
  SKILLS_ROOT      Destination root for skill folders (default: \$HOME/.agents/skills)

Known sub-skills:
$(printf '  - %s\n' "${ALL_SKILLS[@]}")

Examples:
  fetch-upstream-skills.sh --list
  fetch-upstream-skills.sh --skill gsap --skill animation-on-scroll
  fetch-upstream-skills.sh --all
  fetch-upstream-skills.sh --dry-run --all
EOF
}

is_known_skill() {
  local candidate="$1"
  local known
  for known in "${ALL_SKILLS[@]}"; do
    if [[ "$known" == "$candidate" ]]; then
      return 0
    fi
  done
  return 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h)
      usage
      exit 0
      ;;
    --skill)
      if [[ $# -lt 2 ]]; then
        echo "✗ --skill requires a value" >&2
        exit 1
      fi
      REQUESTED_SKILLS+=("$2")
      shift 2
      ;;
    --all)
      FETCH_ALL=1
      shift
      ;;
    --list)
      printf '%s\n' "${ALL_SKILLS[@]}"
      exit 0
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    *)
      echo "✗ Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ $FETCH_ALL -eq 1 ]]; then
  REQUESTED_SKILLS=("${ALL_SKILLS[@]}")
fi

if [[ ${#REQUESTED_SKILLS[@]} -eq 0 ]]; then
  echo "✗ No skills requested. Use --skill <name> (repeatable) or --all." >&2
  usage >&2
  exit 1
fi

# Validate and de-duplicate requested skills.
declare -a VALID_SKILLS=()
for skill in "${REQUESTED_SKILLS[@]}"; do
  if ! is_known_skill "$skill"; then
    echo "✗ Unknown sub-skill: '$skill'" >&2
    echo "  Known sub-skills:" >&2
    printf '    - %s\n' "${ALL_SKILLS[@]}" >&2
    exit 1
  fi
  duplicate=0
  for seen in "${VALID_SKILLS[@]:-}"; do
    if [[ "$seen" == "$skill" ]]; then
      duplicate=1
      break
    fi
  done
  if [[ $duplicate -eq 0 ]]; then
    VALID_SKILLS+=("$skill")
  fi
done

echo "Upstream repo:    $UPSTREAM_REPO"
echo "Upstream subdir:  $UPSTREAM_SUBDIR"
echo "Destination root: $SKILLS_ROOT"
echo "Skills requested: ${VALID_SKILLS[*]}"
echo

if [[ $DRY_RUN -eq 1 ]]; then
  echo "[dry-run] Would sparse-checkout '$UPSTREAM_SUBDIR' from $UPSTREAM_REPO"
  for skill in "${VALID_SKILLS[@]}"; do
    echo "[dry-run] Would copy $UPSTREAM_SUBDIR/$skill -> $SKILLS_ROOT/$skill"
  done
  exit 0
fi

if ! command -v git >/dev/null 2>&1; then
  echo "✗ git is required but was not found on PATH" >&2
  exit 1
fi

mkdir -p "$SKILLS_ROOT"

SCRATCH_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$SCRATCH_DIR"
}
trap cleanup EXIT

echo "Cloning (sparse) $UPSTREAM_REPO ..."
git clone --depth 1 --filter=blob:none --sparse "$UPSTREAM_REPO" "$SCRATCH_DIR/repo" >/dev/null
git -C "$SCRATCH_DIR/repo" sparse-checkout set "$UPSTREAM_SUBDIR" >/dev/null

SOURCE_DIR="$SCRATCH_DIR/repo/$UPSTREAM_SUBDIR"
if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "✗ Expected upstream path not found after checkout: $UPSTREAM_SUBDIR" >&2
  exit 1
fi

for skill in "${VALID_SKILLS[@]}"; do
  src="$SOURCE_DIR/$skill"
  dest="$SKILLS_ROOT/$skill"
  if [[ ! -d "$src" ]]; then
    echo "✗ Sub-skill folder missing upstream: $skill" >&2
    continue
  fi
  mkdir -p "$dest"
  cp -R "$src/." "$dest/"
  echo "✓ Copied $skill -> $dest"
done

echo
echo "Done. Nothing was deleted at $SKILLS_ROOT."
