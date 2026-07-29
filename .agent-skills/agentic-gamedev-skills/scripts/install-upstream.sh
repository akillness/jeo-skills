#!/usr/bin/env bash
set -euo pipefail

repo="${UPSTREAM_REPO:-https://github.com/abagames/agentic-gamedev-skills.git}"
ref="${REF:-d632732fa0f09dfac9bb4d5fa2e5c8872f41cc10}"
root="${SKILLS_ROOT:-$HOME/.agents/skills}"
list_only=false
all=false
force=false
selected=()

usage() {
  cat <<'EOF'
usage: install-upstream.sh --list
       install-upstream.sh [--skill NAME ... | --all] [--force]

Environment: REF, SKILLS_ROOT, UPSTREAM_REPO
EOF
}
while (($#)); do
  case "$1" in
    --list) list_only=true; shift ;;
    --all) all=true; shift ;;
    --skill) (($# >= 2)) || { echo '--skill needs a value' >&2; exit 2; }; selected+=("$2"); shift 2 ;;
    --force) force=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

skills=(
  designing-mini-games designing-minimal-game-rules generating-retro-arcade-concepts
  verifying-turn-based-games scaffolding-godot-mini-games running-headless-godot
  developing-with-crisp-game-lib arcadifying-mini-games implementing-gameplay-invariants
  smoke-testing-web-games probing-web-game-mechanics directing-game-visuals maximizing-game-feel
  creating-godot-procedural-audio styling-web-game-typography designing-retro-arcade-sound-kits
  generating-dot-assets evaluating-gameplay-balance extracting-agent-skills
  extracting-spec-design-ladders gating-by-blind-restoration gating-expensive-batch-work
  migrating-agents-md-to-control-flow refining-workflows-from-artifacts critiquing-own-response
)
if $list_only; then
  printf '%s\n' "${skills[@]}"
  exit 0
fi
if $all && ((${#selected[@]})); then echo 'choose --all or --skill, not both' >&2; exit 2; fi
if ! $all && ((${#selected[@]} == 0)); then echo 'select at least one --skill or use --all' >&2; exit 2; fi
$all && selected=("${skills[@]}")

for name in "${selected[@]}"; do
  [[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || { echo "unsafe skill name: $name" >&2; exit 2; }
  if [[ -e "$root/$name" && "$force" != true ]]; then
    echo "destination exists (use --force after review): $root/$name" >&2
    exit 1
  fi
done

work="$(mktemp -d "${TMPDIR:-/tmp}/agentic-gamedev.XXXXXX")"
cleanup() { rm -rf "$work"; }
trap cleanup EXIT
command -v git >/dev/null 2>&1 || { echo 'git is required' >&2; exit 1; }
git clone --quiet --filter=blob:none --no-checkout "$repo" "$work/repo"
git -C "$work/repo" checkout --quiet --detach "$ref"

for name in "${selected[@]}"; do
  source="$work/repo/.agents/skills/$name"
  [[ -f "$source/SKILL.md" && -s "$source/SKILL.md" ]] || { echo "upstream skill missing SKILL.md: $name" >&2; exit 1; }
  declared="$(awk '/^name:/{print $2; exit}' "$source/SKILL.md")"
  [[ "$declared" == "$name" ]] || { echo "frontmatter name mismatch for $name: $declared" >&2; exit 1; }
done

mkdir -p "$root"
for name in "${selected[@]}"; do
  destination="$root/$name"
  if [[ -e "$destination" ]]; then rm -rf "$destination"; fi
  cp -R "$work/repo/.agents/skills/$name" "$destination"
  echo "installed $name -> $destination (ref $ref)"
done
