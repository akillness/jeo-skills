#!/usr/bin/env bash
# Install the six default full-mode tools without activating project memory,
# indexes, models, MCP servers, or hooks. Each tool is attempted independently.
set -u

MEX_VERSION=0.8.4
ZVEC_GREP_VERSION=0.2.2
SPEC_KIT_VERSION=1.0.6
RTK_VERSION=0.49.0
SEMBLE_VERSION=0.7.0
CLIHUB_VERSION=0.1.0

PROJECT_DIR=${1:-$PWD}
SPEC_KIT_INTEGRATION=${SPEC_KIT_INTEGRATION:-codex}
failures=()
successes=()

record() {
  local name=$1
  shift
  printf '\n==> %s\n' "$name"
  if "$@"; then
    successes+=("$name")
  else
    failures+=("$name")
    printf 'WARNING: %s failed; continuing with the remaining full-mode tools.\n' "$name" >&2
  fi
}

require_node_22() {
  command -v node >/dev/null 2>&1 || { printf 'Node.js 22.20+ is required.\n' >&2; return 1; }
  local major minor
  read -r major minor <<EOF
$(node -p 'process.versions.node.split(".").slice(0,2).join(" ")' 2>/dev/null)
EOF
  if [ "${major:-0}" -lt 22 ] || { [ "$major" -eq 22 ] && [ "${minor:-0}" -lt 20 ]; }; then
    printf 'Node.js 22.20+ is required (found %s).\n' "$(node --version 2>/dev/null)" >&2
    return 1
  fi
}

install_mex() {
  require_node_22 || return
  command -v npm >/dev/null 2>&1 || return 1
  npm install -g "mex-agent@$MEX_VERSION" || return
  if command -v mex-agent >/dev/null 2>&1; then
    [ "$(mex-agent --version | head -1)" = "$MEX_VERSION" ]
  else
    [ "$(mex --version | head -1)" = "$MEX_VERSION" ]
  fi
}

install_zvec_grep() {
  require_node_22 || return
  npm install -g "@zvec/zvec-grep@$ZVEC_GREP_VERSION" || return
  zg version >/dev/null && zg help >/dev/null
}

install_spec_kit() {
  command -v uv >/dev/null 2>&1 || { printf 'uv is required for pinned spec-kit installation.\n' >&2; return 1; }
  uv tool install --force specify-cli --from "git+https://github.com/github/spec-kit.git@v$SPEC_KIT_VERSION" || return
  specify --version >/dev/null || return

  # Generate into an empty staging directory, then copy only absent paths. This
  # avoids spec-kit's --force behavior, which may overwrite managed project files.
  local stage manifest
  stage=$(mktemp -d "${TMPDIR:-/tmp}/jeo-spec-kit.XXXXXX") || return
  manifest="$stage/collisions.txt"
  if ! (cd "$stage" && specify init --here --force --non-interactive --integration "$SPEC_KIT_INTEGRATION"); then
    rm -rf "$stage"
    return 1
  fi
  python3 - "$stage" "$PROJECT_DIR" "$manifest" <<'PY'
from pathlib import Path
import shutil, sys

source, target, report = map(Path, sys.argv[1:])
collisions = []
for item in sorted(source.rglob("*")):
    if item == report:
        continue
    relative = item.relative_to(source)
    destination = target / relative
    if item.is_dir():
        destination.mkdir(parents=True, exist_ok=True)
    elif destination.exists() or destination.is_symlink():
        collisions.append(str(relative))
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(item, destination, follow_symlinks=False)
report.write_text("\n".join(collisions) + ("\n" if collisions else ""), encoding="utf-8")
PY
  if [ -s "$manifest" ]; then
    printf 'spec-kit preserved existing files; collisions:\n'
    sed 's/^/  - /' "$manifest"
  fi
  rm -rf "$stage"
}

install_rtk() {
  command -v cargo >/dev/null 2>&1 || { printf 'cargo is required for pinned RTK installation.\n' >&2; return 1; }
  if [ "$(uname -s 2>/dev/null)" = Linux ] && [ "$(uname -m 2>/dev/null)" = aarch64 ]; then
    printf 'NOTE: RTK Linux ARM64 requires a compatible glibc toolchain; build/link failure is recorded as partial success.\n' >&2
  fi
  cargo install --git https://github.com/rtk-ai/rtk --tag "v$RTK_VERSION" --locked --force rtk || return
  rtk --version >/dev/null && rtk gain >/dev/null
}

install_semble() {
  command -v uv >/dev/null 2>&1 || return 1
  uv tool install --force "semble==$SEMBLE_VERSION" || return
  semble --version >/dev/null && semble --help >/dev/null
}

install_clihub() {
  command -v uv >/dev/null 2>&1 || return 1
  uv tool install --force "clihub-ai==$CLIHUB_VERSION" || return
  clihub --version >/dev/null 2>&1 || clihub doctor >/dev/null
}

record mex install_mex
record zvec-grep install_zvec_grep
record spec-kit install_spec_kit
record RTK install_rtk
record Semble install_semble
record CLI-Hub install_clihub

printf '\nFull-tool result: %s/6 succeeded.\n' "${#successes[@]}"
printf 'Succeeded:'; printf ' %s' "${successes[@]}"; printf '\n'
if [ "${#failures[@]}" -gt 0 ]; then
  printf 'PARTIAL SUCCESS - failed:' >&2
  printf ' %s' "${failures[@]}" >&2
  printf '\n' >&2
  exit 1
fi
printf 'All six full-mode tools installed and executable.\n'
