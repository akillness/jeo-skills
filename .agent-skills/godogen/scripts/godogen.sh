#!/usr/bin/env bash
# Godogen skill helper. Read-only by design.
# It never clones, installs, publishes, deletes, initializes Git, starts an engine,
# opens a browser, or calls a paid provider.
#
# Usage:
#   godogen.sh doctor [all|godot|bevy|babylon]
#   godogen.sh plan --engine ENGINE --agent AGENT --out DIR
#   godogen.sh upstream

set -euo pipefail

PIN="05cebffc8b10c5817e8a3db495b82e7b6004ab84"
BASE="https://github.com/htdt/godogen"

usage() {
  sed -n '2,10p' "$0" >&2
  exit 1
}

have() {
  command -v "$1" >/dev/null 2>&1
}

first_line() {
  "$@" 2>/dev/null | head -1 || true
}

report_command() {
  local label="$1"
  local found=""
  local candidate
  shift
  for candidate in "$@"; do
    if have "$candidate"; then
      found="$(command -v "$candidate")"
      break
    fi
  done
  if [[ -n "$found" ]]; then
    printf '  ok    %-14s %s\n' "$label" "$found"
  else
    printf '  info  %-14s missing\n' "$label"
  fi
}

check_python() {
  local version ok
  if ! have python3; then
    echo "  ERROR python3        missing (requires 3.10+)"
    return
  fi
  version="$(python3 -c 'import platform; print(platform.python_version())' 2>/dev/null || echo unknown)"
  ok="$(python3 -c 'import sys; print(int(sys.version_info >= (3, 10)))' 2>/dev/null || echo 0)"
  if [[ "$ok" == "1" ]]; then
    echo "  ok    python3        $version"
  else
    echo "  ERROR python3        $version (requires 3.10+)"
  fi
}

check_godot() {
  local dotnet_v dotnet_major godot_v
  echo "-- Godot lane --"
  if have dotnet; then
    dotnet_v="$(first_line dotnet --version)"
    dotnet_major="${dotnet_v%%.*}"
    if [[ "$dotnet_major" =~ ^[0-9]+$ ]] && [[ "$dotnet_major" -ge 9 ]]; then
      echo "  ok    dotnet         $dotnet_v"
    else
      echo "  WARN  dotnet         ${dotnet_v:-unknown} (Godot 4.5+ requires .NET 9)"
    fi
  else
    echo "  ERROR dotnet         missing"
  fi

  if have godot; then
    godot_v="$(first_line godot --version)"
    if printf '%s' "$godot_v" | grep -qi 'mono'; then
      echo "  ok    godot          $godot_v"
    else
      echo "  ERROR godot          ${godot_v:-unknown} (requires the .NET/Mono build)"
    fi
  else
    echo "  ERROR godot          missing (requires Godot 4 .NET/Mono)"
  fi
}

check_bevy() {
  echo "-- Bevy lane --"
  if have cargo; then
    echo "  ok    cargo          $(first_line cargo --version)"
  else
    echo "  ERROR cargo          missing"
  fi
  if have rustc; then
    echo "  ok    rustc          $(first_line rustc --version)"
  else
    echo "  ERROR rustc          missing"
  fi
  echo "  note  resolve current stable Bevy, pin the exact version, keep bevy_* on one minor"
}

find_chrome() {
  local name path
  if [[ -n "${CHROME_BIN:-}" ]] && [[ -x "${CHROME_BIN}" ]]; then
    printf '%s\n' "$CHROME_BIN"
    return
  fi
  for name in google-chrome google-chrome-stable chromium chromium-browser; do
    if have "$name"; then
      command -v "$name"
      return
    fi
  done
  for path in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
    if [[ -x "$path" ]]; then
      printf '%s\n' "$path"
      return
    fi
  done
}

check_babylon() {
  local node_v node_ok chrome
  echo "-- Babylon.js lane --"
  if have node; then
    node_v="$(node --version 2>/dev/null || echo unknown)"
    node_ok="$(node -e 'const [M,m]=process.versions.node.split(".").map(Number); process.stdout.write(String(M>22||(M===22&&m>=12)))' 2>/dev/null || echo false)"
    if [[ "$node_ok" == "true" ]]; then
      echo "  ok    node           $node_v (requires 22.12+)"
    else
      echo "  ERROR node           $node_v (requires 22.12+)"
    fi
  else
    echo "  ERROR node           missing (requires 22.12+)"
  fi

  if have npm; then
    echo "  ok    npm            $(first_line npm --version)"
  else
    echo "  ERROR npm            missing"
  fi

  chrome="$(find_chrome || true)"
  if [[ -n "$chrome" ]]; then
    echo "  ok    chrome         $chrome"
  else
    echo "  ERROR chrome         not found; set CHROME_BIN if installed elsewhere"
  fi
  echo "  note  presence is not GPU proof; inspect WebGL RENDERER during capture"
}

print_keys() {
  local key value
  echo "-- Paid provider key presence (values never printed) --"
  for key in GOOGLE_API_KEY XAI_API_KEY TRIPO3D_API_KEY; do
    case "$key" in
      GOOGLE_API_KEY) value="${GOOGLE_API_KEY:-}" ;;
      XAI_API_KEY) value="${XAI_API_KEY:-}" ;;
      TRIPO3D_API_KEY) value="${TRIPO3D_API_KEY:-}" ;;
    esac
    if [[ -n "$value" ]]; then
      printf '  set     %s\n' "$key"
    else
      printf '  missing %s\n' "$key"
    fi
  done
}

cmd="${1:-}"

case "$cmd" in
  doctor)
    engine="${2:-all}"
    case "$engine" in
      all|godot|bevy|babylon) ;;
      *) echo "error: doctor engine must be all, godot, bevy, or babylon" >&2; exit 1 ;;
    esac
    if [[ $# -gt 2 ]]; then
      echo "error: doctor accepts at most one engine" >&2
      exit 1
    fi

    echo "== Godogen readiness report (read-only) =="
    echo "  info  host           $(uname -s 2>/dev/null || echo unknown) $(uname -m 2>/dev/null || echo unknown)"
    report_command git git
    report_command rsync rsync
    check_python
    report_command ffmpeg ffmpeg
    report_command imagemagick magick convert
    report_command vulkaninfo vulkaninfo
    report_command xvfb-run xvfb-run
    echo "  note  vulkaninfo and xvfb-run are Linux/headless checks, not universal host blockers"

    case "$engine" in
      all)
        check_godot
        check_bevy
        check_babylon
        ;;
      godot) check_godot ;;
      bevy) check_bevy ;;
      babylon) check_babylon ;;
    esac

    print_keys
    echo "== end of report; nothing was installed, changed, launched, or billed =="
    ;;

  plan)
    shift
    engine=""
    agent=""
    out=""
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --engine)
          [[ $# -ge 2 && -n "${2:-}" ]] || { echo "error: --engine requires a value" >&2; exit 1; }
          engine="$2"; shift 2
          ;;
        --agent)
          [[ $# -ge 2 && -n "${2:-}" ]] || { echo "error: --agent requires a value" >&2; exit 1; }
          agent="$2"; shift 2
          ;;
        --out)
          [[ $# -ge 2 && -n "${2:-}" ]] || { echo "error: --out requires a value" >&2; exit 1; }
          out="$2"; shift 2
          ;;
        -h|--help) usage ;;
        *) echo "error: unknown plan option: $1" >&2; usage ;;
      esac
    done

    case "$engine" in
      godot|bevy|babylon) ;;
      *) echo "error: --engine must be godot, bevy, or babylon" >&2; exit 1 ;;
    esac
    case "$agent" in
      claude)
        manifest="CLAUDE.md"
        skills_rel=".claude/skills"
        ;;
      codex)
        manifest="AGENTS.md"
        skills_rel=".agents/skills"
        ;;
      *) echo "error: --agent must be claude or codex" >&2; exit 1 ;;
    esac
    if [[ -z "$out" ]]; then
      echo "error: --out DIR is required" >&2
      exit 1
    fi

    echo "== Godogen publish plan (read-only) =="
    echo "  engine: $engine"
    echo "  agent:  $agent"
    echo "  target: $out"
    echo "  payload:"
    echo "    $manifest"
    echo "    $engine.md"
    echo "    $skills_rel/asset-gen/"
    if [[ "$agent" == "codex" ]]; then
      echo "    $skills_rel/asset-gen/agents/openai.yaml"
    fi
    echo "    .gitignore (only if absent)"
    echo "    .git/ (publish.sh runs git init)"

    blocked=0
    update=0
    skills_path="$out/$skills_rel"
    if [[ -L "$out" ]]; then
      echo "  BLOCK target is a symlink; choose an explicit directory"
      blocked=1
    elif [[ -e "$out" ]] && [[ ! -d "$out" ]]; then
      echo "  BLOCK target exists and is not a directory"
      blocked=1
    elif [[ -d "$out" ]]; then
      first="$(find "$out" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)"
      if [[ -z "$first" ]]; then
        echo "  ok    target exists and is empty (new publication)"
      else
        sibling=""
        if [[ -d "$skills_path" ]]; then
          sibling="$(find "$skills_path" -mindepth 1 -maxdepth 1 ! -name asset-gen -print -quit 2>/dev/null || true)"
        fi
        expected_command="/asset-gen"
        [[ "$agent" == "codex" ]] && expected_command='\$asset-gen'
        if [[ -f "$out/$manifest" ]] \
          && [[ -f "$out/$engine.md" ]] \
          && [[ -f "$skills_path/asset-gen/SKILL.md" ]] \
          && [[ ! -L "$skills_path/asset-gen" ]] \
          && grep -q '^# Build .* game from a description$' "$out/$manifest" \
          && grep -Fq "$engine.md" "$out/$manifest" \
          && grep -q "$expected_command" "$out/$manifest" \
          && [[ -z "$sibling" ]]; then
          update=1
          echo "  ok    recognized same-lane Godogen runtime (normal re-publish only)"
          echo "  WARN  commit or back up the game repo before refreshing generated runtime files"
        else
          echo "  BLOCK target is nonempty and is not a safe same-lane Godogen refresh"
          echo "        first entry: $first"
          if [[ -n "$sibling" ]]; then
            echo "  BLOCK $skills_rel contains a sibling entry: $sibling"
            echo "        upstream rsync --delete would remove it"
          fi
          blocked=1
        fi
      fi
    else
      echo "  ok    target does not exist yet; publish.sh would create it (new publication)"
    fi

    echo "  WARN  --force removes the whole resolved target with rm -rf"
    echo "  WARN  normal publish replaces $manifest, $engine.md, and the entire $skills_rel directory"
    if [[ "$update" -eq 1 ]]; then
      echo "  note  refresh with normal publish only; do not add --force"
    fi
    echo "== end of plan; nothing was created, removed, initialized, or billed =="

    if [[ "$blocked" -ne 0 ]]; then
      exit 2
    fi
    ;;

  upstream)
    cat <<EOF
Godogen upstream pin: $PIN
Repository:             $BASE
Pinned tree:            $BASE/tree/$PIN
README:                 $BASE/blob/$PIN/README.md
Publisher:              $BASE/blob/$PIN/publish.sh
Runtime manifest:       $BASE/blob/$PIN/prompts/runtime.md
Setup:                  $BASE/blob/$PIN/setup.md
Asset skill:            $BASE/blob/$PIN/asset-gen/SKILL.md
Godot guide:            $BASE/blob/$PIN/engines/godot.md
Bevy guide:             $BASE/blob/$PIN/engines/bevy.md
Babylon guide:          $BASE/blob/$PIN/engines/babylon.md
EOF
    ;;

  *)
    usage
    ;;
esac
