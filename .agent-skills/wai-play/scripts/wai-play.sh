#!/usr/bin/env bash
# WAI Play skill helper — read-only by default.
#
# `doctor` inspects the environment and never installs anything, never starts
# a browser, and never runs a playtest. `check` forwards to the stdlib-only
# static integration checker. `demo` starts the bundled demo-game server in
# the foreground, which is a deliberate, user-visible action.
#
# Usage:
#   wai-play.sh doctor [wai-play-repo-dir]
#   wai-play.sh check <game-type> <file.js> [more.js...]
#   wai-play.sh demo <wai-play-repo-dir> [port]

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
    echo "== WAI Play prerequisite report (read-only) =="

    if [[ -z "$PY" ]]; then
      echo "  MISSING python        no python3/python on PATH (3.12 recommended)"
    else
      pyver="$($PY --version 2>&1)"
      echo "  ok    python         $pyver  ($PY)"
      if ! $PY -c 'import sys; sys.exit(0 if sys.version_info[:2] >= (3, 10) else 1)' >/dev/null 2>&1; then
        echo "  WARN  python         below 3.10; upstream targets 3.12"
      fi
    fi

    if [[ -n "$PY" ]]; then
      for mod in streamlit playwright openai dotenv; do
        if $PY -c "import $mod" >/dev/null 2>&1; then
          ver="$($PY -c "import $mod; print(getattr($mod, '__version__', '?'))" 2>/dev/null || echo '?')"
          printf '  ok    %-14s %s\n' "$mod" "$ver"
        else
          printf '  MISSING %-12s not importable (pip install -r requirements.txt)\n' "$mod"
        fi
      done
    fi

    # Playwright browser cache — Chromium must be downloaded separately.
    found_browser=0
    for dir in "${PLAYWRIGHT_BROWSERS_PATH:-}" \
               "$HOME/Library/Caches/ms-playwright" \
               "$HOME/.cache/ms-playwright" \
               "${LOCALAPPDATA:-}/ms-playwright"; do
      [[ -n "$dir" && -d "$dir" ]] || continue
      if compgen -G "$dir/chromium*" >/dev/null 2>&1; then
        echo "  ok    chromium       present in $dir"
        found_browser=1
        break
      fi
    done
    if [[ "$found_browser" -eq 0 ]]; then
      echo "  MISSING chromium     no Playwright Chromium build found (python -m playwright install chromium)"
    fi

    if [[ -n "$repo" ]]; then
      if [[ -d "$repo" ]]; then
        echo "  ok    repo           $repo"
        for f in app.py requirements.txt game_profiles.py integration_templates.py; do
          if [[ -f "$repo/$f" ]]; then
            printf '  ok    %-14s present\n' "$f"
          else
            printf '  WARN  %-14s missing (is this a wai-play checkout?)\n' "$f"
          fi
        done
        # Report key NAMES only — never values.
        if [[ -f "$repo/.env" ]]; then
          echo "  ok    .env           present"
          for key in DEEPSEEK_API_KEY KIMI_API_KEY; do
            if grep -qE "^${key}=.+" "$repo/.env" 2>/dev/null; then
              printf '  ok    %-14s set\n' "$key"
            else
              printf '  info  %-14s empty (keyless run: no source modeling, no AI planning/suggestions)\n' "$key"
            fi
          done
        else
          echo "  info  .env           absent (cp .env.example .env); keyless runs are degraded but valid"
        fi
        if [[ -d "$repo/web_examples/five_games" ]]; then
          echo "  ok    demo games     web_examples/five_games"
        else
          echo "  info  demo games     not found at web_examples/five_games"
        fi
      else
        echo "  MISSING repo         '$repo' is not a directory"
      fi
    else
      echo "  info  repo           not given; pass a checkout path to check app.py/.env/demos"
    fi

    echo "== end of report; nothing was installed, launched, or tested =="
    ;;

  check)
    PY="$(py)"
    [[ -n "$PY" ]] || { echo "error: python3 is required for 'check'" >&2; exit 1; }
    game_type="${2:-}"
    if [[ -z "$game_type" || -z "${3:-}" ]]; then
      echo "usage: wai-play.sh check <game-type> <file.js> [more.js...]" >&2
      exit 1
    fi
    shift 2
    exec "$PY" "$SCRIPT_DIR/check_integration.py" --game-type "$game_type" "$@"
    ;;

  demo)
    PY="$(py)"
    [[ -n "$PY" ]] || { echo "error: python3 is required for 'demo'" >&2; exit 1; }
    repo="${2:-}"
    port="${3:-8768}"
    if [[ -z "$repo" ]]; then
      echo "usage: wai-play.sh demo <wai-play-repo-dir> [port]" >&2
      exit 1
    fi
    dir="$repo/web_examples/five_games"
    if [[ ! -d "$dir" ]]; then
      echo "error: demo games not found at $dir" >&2
      exit 1
    fi
    echo "Serving WAI Play demo games at http://127.0.0.1:$port (Ctrl-C to stop)"
    echo "  survivor.html · arcade-shooter.html · platformer.html · puzzle-card.html · visual-novel.html"
    exec "$PY" -m http.server "$port" --bind 127.0.0.1 --directory "$dir"
    ;;

  *)
    usage
    ;;
esac
