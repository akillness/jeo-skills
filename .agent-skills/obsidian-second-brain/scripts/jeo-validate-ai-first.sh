#!/usr/bin/env bash
# jeo-validate-ai-first.sh — write-time AI-first validator adapter for jeo.
#
# jeo's post-turn / pre-tool hook payload (stdin JSON) uses either a single
# call shape (.args.filePath) or a batch shape (.calls[].args.filePath). The
# upstream obsidian-second-brain validator expects Claude Code's shape
# (.tool_input.file_path). This adapter normalizes both jeo shapes, then runs
# the AI-first checks once per markdown file written/edited inside the vault.
#
# Behavior is ADVISORY: it never reverts a write. It only emits warnings on
# stderr (surfaced to the model) and exits 1 when something looks off, exit 0
# otherwise. Files outside OBSIDIAN_VAULT_PATH and non-markdown files are
# ignored. If the upstream validator is present it is preferred; otherwise the
# self-contained checks below run.
#
# Env:
#   OBSIDIAN_VAULT_PATH  — vault root; only files under it are checked (required)
#   OSB_UPSTREAM_VALIDATOR — optional path to upstream validate-ai-first.sh

set -uo pipefail

vault="${OBSIDIAN_VAULT_PATH:-}"
if [ -z "$vault" ]; then
  # No vault configured — nothing to validate.
  exit 0
fi

# Resolve vault to an absolute, normalized prefix for containment checks.
vault_abs="$(cd "$vault" 2>/dev/null && pwd -P)" || exit 0

if ! command -v jq >/dev/null 2>&1; then
  printf '[osb] jq not found — AI-first validation skipped.\n' >&2
  exit 0
fi

payload="$(cat 2>/dev/null || true)"
[ -n "$payload" ] || exit 0

# Collect file paths from both jeo shapes: single (.args.filePath) and
# batch (.calls[].args.filePath). Tolerate malformed JSON. Avoid bash-4-only
# `mapfile` so this runs on the macOS system bash (3.2).
extract_paths() {
  printf '%s' "$payload" | jq -r '
    [ .args?.filePath?,
      (.calls? // [] | .[]? | .args?.filePath?) ]
    | map(select(. != null and . != "")) | unique | .[]
  ' 2>/dev/null
}

upstream="${OSB_UPSTREAM_VALIDATOR:-$HOME/.claude/skills/obsidian-second-brain/hooks/validate-ai-first.sh}"

warnings=0

check_file() {
  local f="$1"

  # Only markdown.
  case "$f" in
    *.md|*.markdown) ;;
    *) return 0 ;;
  esac

  # Resolve to absolute and require containment within the vault.
  local dir base abs
  dir="$(cd "$(dirname "$f")" 2>/dev/null && pwd -P)" || return 0
  base="$(basename "$f")"
  abs="$dir/$base"
  case "$abs/" in
    "$vault_abs"/*) ;;
    *) return 0 ;;
  esac

  [ -f "$abs" ] || return 0

  # Prefer the upstream validator when available (Claude shape).
  if [ -x "$upstream" ] || [ -f "$upstream" ]; then
    local out rc
    out="$(printf '{"tool_input":{"file_path":%s}}' "$(jq -Rn --arg p "$abs" '$p')" \
      | OBSIDIAN_VAULT_PATH="$vault_abs" bash "$upstream" 2>&1)"
    rc=$?
    if [ "$rc" -ne 0 ]; then
      [ -n "$out" ] && printf '%s\n' "$out" >&2
      warnings=$((warnings + 1))
    fi
    return 0
  fi

  # Self-contained AI-first checks (advisory).
  local fm w=()
  # Extract YAML frontmatter block if present.
  fm="$(awk 'NR==1 && $0=="---"{f=1;next} f && $0=="---"{exit} f{print}' "$abs")"
  if [ -z "$fm" ]; then
    w+=("missing YAML frontmatter")
  else
    grep -Eq '^date:'  <<<"$fm" || w+=("frontmatter missing 'date'")
    grep -Eq '^type:'  <<<"$fm" || w+=("frontmatter missing 'type'")
    grep -Eq '^tags:'  <<<"$fm" || w+=("frontmatter missing 'tags'")
    grep -Eq '^ai-first:' <<<"$fm" || w+=("frontmatter missing 'ai-first'")
  fi
  grep -q '## For future Claude' "$abs" || w+=("missing '## For future Claude' preamble")
  # Non-ASCII bytes forbidden in AI-first notes.
  if LC_ALL=C grep -qP '[^\x00-\x7F]' "$abs" 2>/dev/null; then
    w+=("contains non-ASCII characters")
  fi

  if [ "${#w[@]}" -gt 0 ]; then
    printf '[osb] AI-first advisory for %s:\n' "$base" >&2
    local item
    for item in "${w[@]}"; do printf '  - %s\n' "$item" >&2; done
    warnings=$((warnings + 1))
  fi
}

while IFS= read -r f; do
  [ -n "$f" ] && check_file "$f"
done < <(extract_paths)

[ "$warnings" -eq 0 ] || exit 1
exit 0
