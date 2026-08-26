#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)"
INVENTORY="$SCRIPT_DIR/pipeline_inventory.py"

usage() {
  cat <<'EOF'
Usage:
  openmontage.sh doctor [REPO]
  openmontage.sh pipelines [REPO] [--strict] [--format table|json] [--pipeline NAME]
  openmontage.sh preflight [REPO]
  openmontage.sh project [REPO] PROJECT_ID
  openmontage.sh test-contracts [REPO]

REPO defaults to $OPENMONTAGE_REPO, then the current directory.

Safety:
  doctor, pipelines, preflight, and project are read-only. preflight imports the
  checkout and discovers providers but makes no provider request. test-contracts
  runs the upstream pytest contract suite and may write normal test caches.
EOF
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 2
}

repo_default() {
  printf '%s\n' "${OPENMONTAGE_REPO:-.}"
}

resolve_repo() {
  local candidate="$1"
  [ -d "$candidate" ] || fail "repository directory not found: $candidate"
  (
    cd "$candidate"
    pwd -P
  )
}

require_checkout() {
  local repo="$1"
  [ -f "$repo/AGENT_GUIDE.md" ] || fail "missing AGENT_GUIDE.md in $repo"
  [ -f "$repo/PROJECT_CONTEXT.md" ] || fail "missing PROJECT_CONTEXT.md in $repo"
  [ -d "$repo/pipeline_defs" ] || fail "missing pipeline_defs/ in $repo"
  [ -f "$repo/tools/tool_registry.py" ] || fail "missing tools/tool_registry.py in $repo"
  [ -f "$repo/lib/checkpoint.py" ] || fail "missing lib/checkpoint.py in $repo"
}

find_python() {
  local repo="$1"
  if [ -x "$repo/.venv/bin/python" ]; then
    printf '%s\n' "$repo/.venv/bin/python"
  elif command -v python3 >/dev/null 2>&1; then
    command -v python3
  elif command -v python >/dev/null 2>&1; then
    command -v python
  else
    return 1
  fi
}

first_line() {
  sed -n '1p'
}

command_report() {
  local label="$1"
  local command_name="$2"
  shift 2
  if command -v "$command_name" >/dev/null 2>&1; then
    local version
    version="$("$command_name" "$@" 2>&1 | first_line || true)"
    printf '  %-10s OK      %s\n' "$label" "$version"
    return 0
  fi
  printf '  %-10s MISSING\n' "$label"
  return 1
}

doctor() {
  local repo
  repo="$(resolve_repo "$1")"
  require_checkout "$repo"

  local blockers=0
  local warnings=0
  local py=""
  local py_version=""
  local node_version=""
  local node_major=0

  printf 'OpenMontage checkout\n'
  printf '  path       %s\n' "$repo"
  if command -v git >/dev/null 2>&1 && git -C "$repo" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    printf '  commit     %s\n' "$(git -C "$repo" rev-parse HEAD)"
    printf '  branch     %s\n' "$(git -C "$repo" symbolic-ref --quiet --short HEAD 2>/dev/null || printf 'detached')"
    if [ -n "$(git -C "$repo" status --porcelain --untracked-files=normal)" ]; then
      printf '  worktree   DIRTY\n'
      warnings=$((warnings + 1))
    else
      printf '  worktree   clean\n'
    fi
  else
    printf '  commit     unavailable (not a Git worktree or Git missing)\n'
    warnings=$((warnings + 1))
  fi

  printf '\nRequired runtime\n'
  if py="$(find_python "$repo" 2>/dev/null)"; then
    py_version="$("$py" -c 'import sys; print(".".join(map(str, sys.version_info[:3])))')"
    if "$py" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'; then
      printf '  %-10s OK      %s (%s)\n' 'Python' "$py_version" "$py"
    else
      printf '  %-10s BLOCKED %s; need 3.10+ (%s)\n' 'Python' "$py_version" "$py"
      blockers=$((blockers + 1))
    fi
  else
    printf '  %-10s MISSING need 3.10+\n' 'Python'
    blockers=$((blockers + 1))
  fi

  if command_report 'FFmpeg' ffmpeg -version; then :; else blockers=$((blockers + 1)); fi
  if command_report 'ffprobe' ffprobe -version; then :; else blockers=$((blockers + 1)); fi

  if command -v node >/dev/null 2>&1; then
    node_version="$(node --version 2>&1 | first_line)"
    node_major="$(printf '%s' "$node_version" | sed -E 's/^v?([0-9]+).*/\1/')"
    if [ "$node_major" -ge 18 ] 2>/dev/null; then
      printf '  %-10s OK      %s\n' 'Node' "$node_version"
    else
      printf '  %-10s BLOCKED %s; need 18+\n' 'Node' "$node_version"
      blockers=$((blockers + 1))
    fi
  else
    printf '  %-10s MISSING need 18+\n' 'Node'
    blockers=$((blockers + 1))
  fi

  if command_report 'npm' npm --version; then :; else blockers=$((blockers + 1)); fi
  if command_report 'npx' npx --version; then :; else blockers=$((blockers + 1)); fi
  if command_report 'Git' git --version; then :; else warnings=$((warnings + 1)); fi
  if command_report 'Make' make --version; then :; else warnings=$((warnings + 1)); fi

  printf '\nComposition readiness\n'
  printf '  %-12s %s\n' 'FFmpeg' "$(command -v ffmpeg >/dev/null 2>&1 && printf 'candidate' || printf 'unavailable')"
  if [ "$node_major" -ge 18 ] 2>/dev/null && command -v npx >/dev/null 2>&1; then
    if [ -d "$repo/remotion-composer/node_modules" ]; then
      printf '  %-12s candidate (Node 18+ and node_modules present)\n' 'Remotion'
    else
      printf '  %-12s setup needed (node_modules absent)\n' 'Remotion'
      warnings=$((warnings + 1))
    fi
  else
    printf '  %-12s unavailable (needs Node 18+ and npx)\n' 'Remotion'
  fi
  if [ "$node_major" -ge 22 ] 2>/dev/null && command -v npx >/dev/null 2>&1 && command -v ffmpeg >/dev/null 2>&1; then
    printf '  %-12s host candidate; run registry/HyperFrames doctor for package resolution\n' 'HyperFrames'
  else
    printf '  %-12s unavailable (needs Node 22+, npx, and FFmpeg)\n' 'HyperFrames'
  fi

  printf '\nRepository safety\n'
  if [ -f "$repo/.env" ]; then
    if command -v git >/dev/null 2>&1 && git -C "$repo" ls-files --error-unmatch .env >/dev/null 2>&1; then
      printf '  .env       BLOCKED: tracked by Git\n'
      blockers=$((blockers + 1))
    else
      printf '  .env       present and untracked\n'
    fi
  else
    printf '  .env       absent\n'
  fi
  printf '  .venv      %s\n' "$([ -x "$repo/.venv/bin/python" ] && printf 'present' || printf 'absent')"
  printf '  projects   %s\n' "$([ -d "$repo/projects" ] && printf 'present (generated workspace)' || printf 'absent')"

  if [ -n "$py" ] && "$py" "$INVENTORY" "$repo" --strict --format json >/dev/null 2>&1; then
    printf '  manifests  structurally valid; declared director paths resolve\n'
  else
    printf '  manifests  BLOCKED: run pipelines --strict for details\n'
    blockers=$((blockers + 1))
  fi

  printf '\nResult\n'
  if [ "$blockers" -gt 0 ]; then
    printf '  BLOCKED: %s blocker(s), %s warning(s)\n' "$blockers" "$warnings"
    return 1
  fi
  printf '  READY FOR REGISTRY PREFLIGHT: %s warning(s)\n' "$warnings"
}

pipelines() {
  local repo="$1"
  shift
  repo="$(resolve_repo "$repo")"
  require_checkout "$repo"
  local py
  py="$(find_python "$repo")" || fail "Python is required for the inventory helper"
  exec "$py" "$INVENTORY" "$repo" "$@"
}

preflight() {
  local repo
  repo="$(resolve_repo "$1")"
  require_checkout "$repo"
  local py
  py="$(find_python "$repo")" || fail "Python is required for provider preflight"

  cd "$repo"
  PYTHONPATH="$repo${PYTHONPATH:+:$PYTHONPATH}" "$py" - <<'PY'
from tools.tool_registry import registry
import json

registry.discover()
print(json.dumps(registry.provider_menu_summary(), indent=2))
PY
}

project_report() {
  local repo
  repo="$(resolve_repo "$1")"
  require_checkout "$repo"
  local project_id="$2"
  case "$project_id" in
    ''|.|..|*[!A-Za-z0-9._-]*) fail "PROJECT_ID must be one safe path component using letters, digits, dot, underscore, or hyphen" ;;
  esac
  local py
  py="$(find_python "$repo")" || fail "Python is required for the project report"

  "$py" - "$repo" "$project_id" <<'PY'
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

repo = Path(sys.argv[1])
project_id = sys.argv[2]
project = repo / "projects" / project_id
if not project.is_dir():
    print(f"error: project not found: {project}", file=sys.stderr)
    raise SystemExit(2)

errors: list[str] = []


def load(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{path.name}: {exc}")
        return None


def human_size(size: int) -> str:
    value = float(size)
    for unit in ("B", "KiB", "MiB", "GiB"):
        if value < 1024 or unit == "GiB":
            return f"{value:.1f}{unit}" if unit != "B" else f"{int(value)}B"
        value /= 1024
    return f"{size}B"

marker_path = project / "project.json"
marker = load(marker_path) if marker_path.is_file() else None
print(f"Project: {project_id}")
print(f"Path: {project}")
if isinstance(marker, dict):
    print(f"Title: {marker.get('title', '-')}")
    print(f"Pipeline: {marker.get('pipeline_type', '-')}")
    print(f"Created: {marker.get('created_at', '-')}")
else:
    print("Marker: missing or invalid")

checkpoints = []
for path in project.glob("checkpoint_*.json"):
    value = load(path)
    if isinstance(value, dict):
        checkpoints.append((path, value))
checkpoints.sort(key=lambda item: str(item[1].get("timestamp", "")))

print(f"Checkpoints: {len(checkpoints)}")
for path, value in checkpoints:
    stage = value.get("stage", path.stem.removeprefix("checkpoint_"))
    status = value.get("status", "unknown")
    approved = value.get("human_approved")
    artifacts = value.get("artifacts")
    artifact_names = ",".join(sorted(artifacts)) if isinstance(artifacts, dict) else "-"
    partial = value.get("metadata", {}).get("partial_progress") if isinstance(value.get("metadata"), dict) else None
    partial_note = " partial" if partial else ""
    approval_note = " approved" if approved else ""
    print(f"  {stage}: {status}{approval_note}{partial_note}; artifacts={artifact_names or '-'}")

waiting = [
    value.get("stage")
    for _, value in checkpoints
    if value.get("status") == "awaiting_human"
]
in_progress = [
    value.get("stage")
    for _, value in checkpoints
    if value.get("status") == "in_progress"
]
print(f"Awaiting human: {', '.join(map(str, waiting)) if waiting else '-'}")
print(f"In progress: {', '.join(map(str, in_progress)) if in_progress else '-'}")

history_count = sum(1 for _ in (project / "history").glob("checkpoint_*.json")) if (project / "history").is_dir() else 0
print(f"History checkpoints: {history_count}")

decision_path = project / "decision_log.json"
decision_log = load(decision_path) if decision_path.is_file() else None
decisions = decision_log.get("decisions", []) if isinstance(decision_log, dict) else []
print(f"Decisions: {len(decisions) if isinstance(decisions, list) else 'invalid'}")

artifact_files = [path for path in (project / "artifacts").rglob("*") if path.is_file()] if (project / "artifacts").is_dir() else []
asset_files = [path for path in (project / "assets").rglob("*") if path.is_file()] if (project / "assets").is_dir() else []
renders = [path for path in (project / "renders").glob("*.mp4") if path.is_file()] if (project / "renders").is_dir() else []
print(f"Artifact files: {len(artifact_files)}")
print(f"Asset files: {len(asset_files)}")
print(f"Renders: {len(renders)}")
for path in sorted(renders):
    print(f"  {path.name}: {human_size(path.stat().st_size)}")

events_path = project / "events.jsonl"
event_count = 0
last_event: dict[str, Any] | None = None
if events_path.is_file():
    try:
        for line in events_path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            event_count += 1
            try:
                candidate = json.loads(line)
                if isinstance(candidate, dict):
                    last_event = candidate
            except json.JSONDecodeError:
                errors.append(f"events.jsonl line {event_count}: invalid JSON")
    except OSError as exc:
        errors.append(f"events.jsonl: {exc}")
print(f"Events: {event_count}")
if last_event:
    fields = {
        key: last_event.get(key)
        for key in ("timestamp", "event", "tool", "scene_id", "success", "cost_usd")
        if last_event.get(key) is not None
    }
    print("Last event: " + json.dumps(fields, ensure_ascii=False, sort_keys=True))

if errors:
    print("Errors:")
    for error in errors:
        print(f"  {error}")
    raise SystemExit(1)
PY
}

test_contracts() {
  local repo
  repo="$(resolve_repo "$1")"
  require_checkout "$repo"
  command -v make >/dev/null 2>&1 || fail "make is required for test-contracts"
  exec make -C "$repo" test-contracts
}

main() {
  local command="${1:-help}"
  if [ "$#" -gt 0 ]; then
    shift
  fi

  case "$command" in
    help|-h|--help)
      usage
      ;;
    doctor)
      [ "$#" -le 1 ] || fail "doctor accepts at most one REPO"
      doctor "${1:-$(repo_default)}"
      ;;
    pipelines)
      local repo
      if [ "$#" -gt 0 ] && [[ "$1" != -* ]]; then
        repo="$1"
        shift
      else
        repo="$(repo_default)"
      fi
      pipelines "$repo" "$@"
      ;;
    preflight)
      [ "$#" -le 1 ] || fail "preflight accepts at most one REPO"
      preflight "${1:-$(repo_default)}"
      ;;
    project)
      if [ "$#" -eq 1 ]; then
        project_report "$(repo_default)" "$1"
      elif [ "$#" -eq 2 ]; then
        project_report "$1" "$2"
      else
        fail "project requires [REPO] PROJECT_ID"
      fi
      ;;
    test-contracts)
      [ "$#" -le 1 ] || fail "test-contracts accepts at most one REPO"
      test_contracts "${1:-$(repo_default)}"
      ;;
    *)
      fail "unknown command: $command"
      ;;
  esac
}

main "$@"
