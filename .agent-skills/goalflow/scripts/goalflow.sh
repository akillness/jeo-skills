#!/usr/bin/env bash
# goalflow skill helper — read-only.
#
# `doctor` inspects the environment and never installs packages, never starts
# the server, and never connects to Redis or MySQL. `audit` and `check-skill`
# forward to the stdlib-only Python checkers, both of which only read files.
#
# Usage:
#   goalflow.sh doctor [goal-flow-repo-dir]
#   goalflow.sh audit  <goal-flow-repo-dir>
#   goalflow.sh check-skill <skill-dir|SKILL.md> [more...]
#   goalflow.sh check-skill --all <skills-root>

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cmd="${1:-}"

usage() {
  sed -n '2,13p' "$0"
  exit 1
}

py() {
  if command -v python3 >/dev/null 2>&1; then
    echo python3
  elif command -v python >/dev/null 2>&1; then
    echo python
  else
    echo ""
  fi
}

case "$cmd" in
  doctor)
    repo="${2:-}"
    PY="$(py)"
    echo "== goalflow prerequisite report (read-only) =="

    if [[ -z "$PY" ]]; then
      echo "  MISSING python        no python3/python on PATH (upstream targets 3.12)"
    else
      echo "  ok    python         $($PY --version 2>&1)  ($PY)"
      if ! $PY -c 'import sys; sys.exit(0 if sys.version_info[:2] >= (3, 12) else 1)' >/dev/null 2>&1; then
        echo "  WARN  python         below 3.12; upstream pins Python 3.12"
      fi
    fi

    if [[ -n "$PY" ]]; then
      # Core engine + web + storage drivers.
      for mod in langgraph langchain_openai fastapi uvicorn redis pymysql sqlalchemy pydantic; do
        if $PY -c "import $mod" >/dev/null 2>&1; then
          ver="$($PY -c "import $mod; print(getattr($mod, '__version__', '?'))" 2>/dev/null || echo '?')"
          printf '  ok    %-16s %s\n' "$mod" "$ver"
        else
          printf '  MISSING %-14s not importable (pip install -e . or -r requirements.txt)\n' "$mod"
        fi
      done
      # Optional but load-bearing when used.
      for mod in langfuse deepagents mcp; do
        if $PY -c "import $mod" >/dev/null 2>&1; then
          printf '  ok    %-16s present (optional)\n' "$mod"
        else
          printf '  info  %-16s absent (only needed for the matching feature)\n' "$mod"
        fi
      done
      # The two project packages.
      for mod in goalflow agent_kit; do
        if $PY -c "import $mod" >/dev/null 2>&1; then
          printf '  ok    %-16s importable\n' "$mod"
        else
          printf '  info  %-16s not importable (needs pip install -e . from the checkout)\n' "$mod"
        fi
      done
    fi

    if [[ -n "$repo" ]]; then
      if [[ -d "$repo" ]]; then
        echo "  ok    repo           $repo"
        for f in pyproject.toml requirements.txt config.yaml start_server.py; do
          if [[ -f "$repo/$f" ]]; then
            printf '  ok    %-16s present\n' "$f"
          else
            printf '  WARN  %-16s missing (is this a goal-flow checkout?)\n' "$f"
          fi
        done
        for d in src/goalflow src/agent_kit skills docs; do
          [[ -d "$repo/$d" ]] \
            && printf '  ok    %-16s present\n' "$d" \
            || printf '  info  %-16s absent\n' "$d"
        done

        # Report key NAMES only — never values.
        found_env=0
        for envf in .env .env_prod .env_uat .env_test; do
          if [[ -f "$repo/$envf" ]]; then
            found_env=1
            echo "  ok    $envf         present"
            for key in MYSQL_HOST REDIS_CLUSTERS DASHSCOPE_KEY OPENAI_KEY LANGFUSE_SECRET_KEY; do
              if grep -qE "^${key}=.+" "$repo/$envf" 2>/dev/null; then
                printf '        set:   %s\n' "$key"
              else
                printf '        empty: %s\n' "$key"
              fi
            done
          fi
        done
        if [[ "$found_env" -eq 0 ]]; then
          echo "  info  .env           absent (cp .env.example .env). ENV selects the file:"
          echo "                       production→.env_prod  uat→.env_uat  test→.env_test  else→.env"
        fi
        [[ -f "$repo/.env.example" ]] \
          && echo "  ok    .env.example   present" \
          || echo "  WARN  .env.example   missing"

        echo "  note  MySQL backs the LangGraph checkpointer; without it stop/resume and HITL"
        echo "        are not durable. Redis backs caching and the stop flag."
        echo "  note  run 'goalflow.sh audit $repo' before pushing anywhere shared."
      else
        echo "  MISSING repo         '$repo' is not a directory"
      fi
    else
      echo "  info  repo           not given; pass a checkout path to inspect config/.env/layout"
    fi

    echo "== end of report; nothing was installed, launched, or connected to =="
    ;;

  audit)
    PY="$(py)"
    [[ -n "$PY" ]] || { echo "error: python3 is required for 'audit'" >&2; exit 1; }
    repo="${2:-}"
    if [[ -z "$repo" ]]; then
      echo "usage: goalflow.sh audit <goal-flow-repo-dir>" >&2
      exit 1
    fi
    exec "$PY" "$SCRIPT_DIR/preflight_audit.py" "$repo"
    ;;

  check-skill)
    PY="$(py)"
    [[ -n "$PY" ]] || { echo "error: python3 is required for 'check-skill'" >&2; exit 1; }
    if [[ -z "${2:-}" ]]; then
      echo "usage: goalflow.sh check-skill <skill-dir|SKILL.md> [more...]" >&2
      echo "       goalflow.sh check-skill --all <skills-root>" >&2
      exit 1
    fi
    shift
    exec "$PY" "$SCRIPT_DIR/check_goalflow_skill.py" "$@"
    ;;

  *)
    usage
    ;;
esac
