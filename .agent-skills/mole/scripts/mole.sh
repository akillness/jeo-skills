#!/usr/bin/env bash
# Mole skill helper — read-only inspection only.
# Never installs, updates, cleans, uninstalls, purges, or deletes anything.
# `json` is hard-restricted to Mole's three read-only JSON surfaces.
#
# Usage:
#   mole.sh doctor                  # host + install report
#   mole.sh surfaces                # the agent-facing machine-readable API
#   mole.sh json status             # mo status --json
#   mole.sh json analyze [PATH]     # mo analyze [PATH] --json
#   mole.sh json history [LIMIT]    # mo history --json --limit N (1-200)

set -euo pipefail

cmd="${1:-}"

usage() {
  sed -n '2,12p' "$0"
  exit 1
}

mo_bin() {
  command -v mo 2>/dev/null || command -v mole 2>/dev/null || true
}

case "$cmd" in
  doctor)
    echo "== Mole readiness report (read-only) =="

    os="$(uname -s 2>/dev/null || echo unknown)"
    if [[ "$os" == "Darwin" ]]; then
      echo "  ok    os             macOS $(sw_vers -productVersion 2>/dev/null || echo '?') ($(uname -m))"
    else
      echo "  ERROR os             $os — Mole is macOS only (install.sh hard-fails elsewhere)"
    fi

    bin="$(mo_bin)"
    if [[ -n "$bin" ]]; then
      echo "  ok    mole           $bin"
      ver="$("$bin" --version 2>/dev/null | head -1 || true)"
      [[ -n "$ver" ]] && echo "  info  version        $ver"
      case "$bin" in
        /opt/homebrew/*|/usr/local/Cellar/*|/usr/local/homebrew/*)
          echo "  info  channel        Homebrew — upgrade with 'brew upgrade mole' (no --nightly)" ;;
        "$HOME"/.local/bin/*)
          echo "  info  channel        script install, user prefix — 'mo update' stays password-free" ;;
        /usr/local/bin/*)
          if [[ -d "$HOME/.config/mole/lib" ]]; then
            echo "  info  channel        script install to /usr/local/bin — 'mo update' may ask for admin"
          else
            echo "  info  channel        /usr/local/bin (Homebrew symlink or script install)"
          fi ;;
        *) echo "  info  channel        $bin (unrecognized prefix)" ;;
      esac
    else
      echo "  info  mole           not on PATH"
      echo "        brew install mole"
      echo "        curl -fsSL https://raw.githubusercontent.com/tw93/mole/main/install.sh | bash"
    fi

    if command -v brew >/dev/null 2>&1; then
      echo "  ok    brew           $(brew --version 2>/dev/null | head -1)"
    else
      echo "  info  brew           not on PATH (script install path only)"
    fi

    if command -v fd >/dev/null 2>&1; then
      echo "  ok    fd             present — speeds up 'mo purge' and 'mo installer'"
    else
      echo "  info  fd             absent — Mole falls back to 'find' (slower, still correct)"
    fi

    for f in "$HOME/.config/mole/whitelist" \
             "$HOME/.config/mole/whitelist_optimize" \
             "$HOME/.config/mole/purge_paths" \
             "$HOME/.config/mole/clean-list.txt"; do
      if [[ -f "$f" ]]; then
        echo "  ok    config         ${f/#$HOME/~} ($(wc -l < "$f" | tr -d ' ') lines)"
      else
        echo "  info  config         ${f/#$HOME/~} absent"
      fi
    done

    for f in "$HOME/Library/Logs/mole/operations.log" \
             "$HOME/Library/Logs/mole/deletions.log"; do
      if [[ -f "$f" ]]; then
        echo "  ok    log            ${f/#$HOME/~} present — read it with 'mo history --json'"
      else
        echo "  info  log            ${f/#$HOME/~} absent (no run yet, or MO_NO_OPLOG=1)"
      fi
    done

    echo "  note  'mo clean', 'mo purge' and 'mo installer' delete PERMANENTLY."
    echo "  note  'mo uninstall' and 'mo analyze' route through Trash."
    echo "  note  Always run --dry-run first; the dry-run is the undo."
    echo "== end of report; nothing was installed, changed, or deleted =="
    ;;

  surfaces)
    cat <<'EOF'
== Mole agent-facing surfaces (everything else is drawn for humans) ==

  mo analyze --json [PATH]
      { path, overview, entries[{name,path,size,is_dir,insight}],
        large_files[], total_size, total_files }   size is bytes

  mo status --json
      { host, health_score, cpu{}, memory{}, disks[], uptime }

  mo status --watch --interval 1s
      NDJSON, one complete object per line, from a warm collector.
      BOUND IT and terminate — never leave it running in the background.

  mo history --json [--limit N]        N is 1-200
      { logs[], sessions[{command,started_at,items,size,actions{...}}] }

  ~/.config/mole/clean-list.txt
      Every candidate path from the last `mo clean --dry-run`.
      Clean only: `mo purge --dry-run` and `mo installer --dry-run`
      print to the terminal and write no file.

Never parse a TUI frame: interactive `mo analyze` and TTY-attached
`mo status` are full-screen Bubble Tea programs whose output is drawn.
EOF
    ;;

  json)
    sub="${2:-}"
    # Validate the subcommand BEFORE resolving the binary, so the safety
    # refusal is unconditional and does not depend on Mole being installed.
    case "$sub" in
      status|analyze|analyse|history) ;;
      *)
        echo "error: 'json' only accepts status | analyze | history." >&2
        echo "       Destructive commands are intentionally not reachable here." >&2
        echo "       Run 'mo <command> --dry-run' yourself and review it first." >&2
        exit 1
        ;;
    esac
    bin="$(mo_bin)"
    if [[ -z "$bin" ]]; then
      echo "error: 'mo' is not installed or not on PATH" >&2
      exit 1
    fi
    case "$sub" in
      status)
        exec "$bin" status --json
        ;;
      analyze|analyse)
        target="${3:-}"
        if [[ -n "$target" ]]; then
          exec "$bin" analyze "$target" --json
        else
          exec "$bin" analyze --json
        fi
        ;;
      history)
        limit="${3:-20}"
        if ! [[ "$limit" =~ ^[0-9]+$ ]] || [[ "$limit" -lt 1 ]] || [[ "$limit" -gt 200 ]]; then
          echo "error: history limit must be an integer between 1 and 200" >&2
          exit 1
        fi
        exec "$bin" history --json --limit "$limit"
        ;;
    esac
    ;;

  *)
    usage
    ;;
esac
