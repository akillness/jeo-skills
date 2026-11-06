#!/usr/bin/env bash
# Install the six default full-mode tools without activating project memory,
# indexes, models, MCP servers, or hooks. Each tool is attempted independently.
set -u

MEX_VERSION=0.8.4
ZVEC_GREP_VERSION=0.2.2
SPEC_KIT_VERSION=1.2.6.dev0
SPEC_KIT_COMMIT=99e047e9b48c3ecbbc5c3e530fb45bed671960bc
RTK_VERSION=1.1.0
SEMBLE_VERSION=0.7.0
CLIHUB_VERSION=0.4.1

EXTENDED="${JEO_FULL_TOOLS_EXTENDED:-0}"
# --programs adds an offline, read-only readiness report for the five program operators after the tools;
# it is not counted in the tool total and never changes the exit status.
PROGRAMS="${JEO_FULL_TOOLS_PROGRAMS:-0}"
while [ "${1:-}" = "--extended" ] || [ "${1:-}" = "--programs" ]; do
  case "$1" in
    --extended) EXTENDED=1 ;;
    --programs) PROGRAMS=1 ;;
  esac
  shift
done
PROJECT_DIR=${1:-$PWD}
SPEC_KIT_INTEGRATION=${SPEC_KIT_INTEGRATION:-codex}
SCRIPT_DIR=$(cd "${BASH_SOURCE[0]%/*}" 2>/dev/null && pwd || echo "$PWD")
case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) export PATH="$HOME/.local/bin:${CARGO_HOME:-$HOME/.cargo}/bin:$PATH" ;;
esac
failures=()
successes=()
total_tools=6
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

check_version() {
  local expected=$1 output
  shift
  output=$("$@") || return 1
  if [ "$output" != "$expected" ]; then
    printf 'Unexpected version from %s: %s (expected %s)\n' "$1" "$output" "$expected" >&2
    return 1
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
  # TeX Live (Homebrew, MacTeX) ships an unrelated `mex`. When it already owns npm's global
  # `mex` link, npm stops with EEXIST and --force would replace that tool, so install the pinned
  # package under ~/.local without bin links instead. The mex-agent wrapper below finds it there
  # and is the entrypoint whose version is verified.
  local npm_mex
  npm_mex="$(npm prefix -g 2>/dev/null)/bin/mex"
  if { [ -e "$npm_mex" ] || [ -L "$npm_mex" ]; } &&
     ! python3 -c 'import os, sys; sys.exit(0 if "mex-agent" in os.path.realpath(sys.argv[1]) else 1)' "$npm_mex"; then
    printf 'NOTE: %s belongs to another program; installing mex-agent under %s without a mex link.\n' "$npm_mex" "$HOME/.local" >&2
    npm install -g --prefix "$HOME/.local" --no-bin-links "mex-agent@$MEX_VERSION" || return
  else
    npm install -g "mex-agent@$MEX_VERSION" || return
  fi
  local wrapper_src="$SCRIPT_DIR/../.agent-skills/mex/scripts/mex-agent-wrapper.sh"
  if [ ! -f "$wrapper_src" ]; then
    wrapper_src="$HOME/.agents/skills/mex/scripts/mex-agent-wrapper.sh"
  fi
  if [ -f "$wrapper_src" ]; then
    python3 - "$HOME" "$wrapper_src" <<'PY' || true
from pathlib import Path
import shutil, subprocess, sys
home, wrapper = Path(sys.argv[1]), Path(sys.argv[2])
cli_candidates = list(home.glob(".nvm/versions/node/*/lib/node_modules/mex-agent/dist/cli.js")) + [
    home / ".local/lib/node_modules/mex-agent/dist/cli.js",
    home / ".aside/runtime/node/lib/node_modules/mex-agent/dist/cli.js",
    Path("/opt/homebrew/lib/node_modules/mex-agent/dist/cli.js"),
    Path("/usr/local/lib/node_modules/mex-agent/dist/cli.js"),
]
try:
    npm_root = subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, timeout=5)
    if npm_root.returncode == 0 and npm_root.stdout.strip():
        cli_candidates.insert(0, Path(npm_root.stdout.strip()) / "mex-agent/dist/cli.js")
except Exception:
    pass
if any(p.is_file() for p in cli_candidates):
    dest = home / ".local/bin/mex-agent"
    if not dest.exists() and not dest.is_symlink():
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(wrapper, dest)
        dest.chmod(0o755)
PY
  fi
  if [ -x "$HOME/.local/bin/mex-agent" ]; then
    check_version "$MEX_VERSION" "$HOME/.local/bin/mex-agent" --version
  else
    check_version "$MEX_VERSION" mex --version
  fi
}

install_zvec_grep() {
  require_node_22 || return
  npm install -g "@zvec/zvec-grep@$ZVEC_GREP_VERSION" || return
  check_version "$ZVEC_GREP_VERSION" zg version && zg help >/dev/null
}

install_spec_kit() {
  command -v uv >/dev/null 2>&1 || { printf 'uv is required for pinned spec-kit installation.\n' >&2; return 1; }
  uv tool install --force specify-cli --from "git+https://github.com/github/spec-kit.git@$SPEC_KIT_COMMIT" || return
  check_version "specify $SPEC_KIT_VERSION" specify --version || return

  # Generate into an empty staging directory, then copy only absent paths. This
  # avoids spec-kit's --force behavior, which may overwrite managed project files.
  local stage manifest merge_status=0 integ_list="$SPEC_KIT_INTEGRATION"
  stage=$(mktemp -d "${TMPDIR:-/tmp}/jeo-spec-kit.XXXXXX") || return
  manifest="$stage/collisions.txt"
  if [ "$integ_list" = "auto" ]; then
    integ_list=""
    for cand_agent in claude codex gemini opencode cursor copilot; do
      if command -v "$cand_agent" >/dev/null 2>&1; then
        integ_list="${integ_list:+$integ_list }$cand_agent"
      fi
    done
    integ_list="${integ_list:-codex}"
  else
    integ_list="${integ_list//,/ }"
  fi
  for integ in $integ_list; do
    [ -n "$integ" ] || continue
    if ! (cd "$stage" && specify init --here --force --non-interactive --integration "$integ"); then
      rm -rf "$stage"
      return 1
    fi
  done
  python3 - "$stage" "$PROJECT_DIR" "$manifest" <<'PY' || merge_status=$?
from pathlib import Path
import errno, os, secrets, shutil, stat, sys

source, target, report = map(Path, sys.argv[1:])
collisions = []
failed = False
if not target.is_absolute() or ".." in target.parts or not all(
    hasattr(os, flag) for flag in ("O_DIRECTORY", "O_NOFOLLOW")
) or any(fn not in os.supports_dir_fd for fn in (os.open, os.mkdir, os.link, os.unlink, os.stat)):
    print(f"Unsafe project path or unsupported secure directory operations: {target}", file=sys.stderr)
    sys.exit(1)
flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
root_fd = os.open("/", flags)
prefix = Path("/")
try:
    for component in target.parts[1:]:
        prefix = prefix / component
        if root_fd is not None:
            try:
                next_fd = os.open(component, flags, dir_fd=root_fd)
                os.close(root_fd)
                root_fd = next_fd
                continue
            except PermissionError:
                os.close(root_fd)
                root_fd = None
        info = os.lstat(prefix)
        if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
            raise OSError(errno.ELOOP, "Refusing symlink or non-directory ancestor", str(prefix))
        try:
            root_fd = os.open(str(prefix), flags)
        except PermissionError:
            if prefix == target:
                raise

    def merge(src, dest_fd):
        global failed
        with os.scandir(src) as entries:
            items = sorted(entries, key=lambda entry: entry.name)
        for entry in items:
            item = Path(entry.path)
            if item == report:
                continue
            relative = item.relative_to(source)
            if entry.is_symlink():
                collisions.append(f"{relative} (symlink refused)")
                failed = True
                continue
            if entry.is_dir(follow_symlinks=False):
                try:
                    os.mkdir(entry.name, dir_fd=dest_fd)
                except FileExistsError:
                    pass
                try:
                    st = os.stat(entry.name, dir_fd=dest_fd, follow_symlinks=False)
                    if stat.S_ISLNK(st.st_mode):
                        raise OSError(errno.ELOOP, "Symlink directory refused")
                    if not stat.S_ISDIR(st.st_mode):
                        raise OSError(errno.ENOTDIR, "Not a directory")
                    child_fd = os.open(entry.name, flags, dir_fd=dest_fd)
                except OSError as exc:
                    if exc.errno not in (errno.ELOOP, errno.ENOTDIR):
                        raise
                    collisions.append(f"{relative} (symlink or directory/file type conflict)")
                    failed = True
                    continue
                try:
                    merge(item, child_fd)
                finally:
                    os.close(child_fd)
            else:
                temporary = ".jeo-spec-kit-" + secrets.token_hex(16)
                fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=dest_fd)
                try:
                    with os.fdopen(fd, "wb") as dst, item.open("rb") as src_file:
                        shutil.copyfileobj(src_file, dst)
                        os.fchmod(dst.fileno(), stat.S_IMODE(entry.stat(follow_symlinks=False).st_mode))
                    try:
                        os.link(temporary, entry.name, src_dir_fd=dest_fd, dst_dir_fd=dest_fd, follow_symlinks=False)
                    except FileExistsError:
                        existing = os.stat(entry.name, dir_fd=dest_fd, follow_symlinks=False)
                        conflict = not stat.S_ISREG(existing.st_mode)
                        collisions.append(f"{relative}" + (" (symlink or file/type conflict)" if conflict else ""))
                        failed |= conflict
                finally:
                    os.unlink(temporary, dir_fd=dest_fd)
    merge(source, root_fd)
finally:
    os.close(root_fd)
report.write_text("\n".join(collisions) + ("\n" if collisions else ""), encoding="utf-8")
sys.exit(1 if failed else 0)
PY
  if [ -s "$manifest" ]; then
    printf 'spec-kit preserved existing files; collisions:\n'
    sed 's/^/  - /' "$manifest"
  fi
  rm -rf "$stage"
  return "$merge_status"
}

install_rtk() {
  local cargo_rtk="${CARGO_HOME:-$HOME/.cargo}/bin/rtk"
  if [ -x "$cargo_rtk" ] && [ "$("$cargo_rtk" --version 2>/dev/null || true)" = "rtk $RTK_VERSION" ]; then
    : # Already compiled and matches pinned version
  elif ! command -v cargo >/dev/null 2>&1; then
    # Nothing can build the pin here. A release already on PATH (for example Homebrew's) at the
    # pinned version satisfies it; any other state still fails, so a missing toolchain is never hidden.
    if [ "$(rtk --version 2>/dev/null || true)" = "rtk $RTK_VERSION" ] && rtk gain >/dev/null 2>&1; then
      return 0
    fi
    printf 'cargo is required for pinned RTK installation (no rtk %s on PATH either).\n' "$RTK_VERSION" >&2
    return 1
  else
    if [ "$(uname -s 2>/dev/null)" = Linux ] && [ "$(uname -m 2>/dev/null)" = aarch64 ]; then
      printf 'NOTE: RTK Linux ARM64 may fail because of glibc/toolchain compatibility; failure is recorded.\n' >&2
    fi
    cargo install --git https://github.com/rtk-ai/rtk --tag "v$RTK_VERSION" --locked --force rtk || return
  fi
  if [ -x "$cargo_rtk" ]; then
    python3 - "$HOME" "$cargo_rtk" <<'PY' || true
from pathlib import Path
import os, sys
home, cargo_rtk = Path(sys.argv[1]), Path(sys.argv[2])
dest = home / ".local/bin/rtk"
dest.parent.mkdir(parents=True, exist_ok=True)
if dest.is_symlink() or not dest.exists():
    if dest.is_symlink():
        dest.unlink()
    os.symlink(str(cargo_rtk), str(dest))
PY
    check_version "rtk $RTK_VERSION" "$HOME/.local/bin/rtk" --version && "$HOME/.local/bin/rtk" gain >/dev/null
  else
    check_version "rtk $RTK_VERSION" rtk --version && rtk gain >/dev/null
  fi
}

install_semble() {
  command -v uv >/dev/null 2>&1 || return 1
  uv tool install --force "semble==$SEMBLE_VERSION" || return
  check_version "$SEMBLE_VERSION" semble --version && semble --help >/dev/null
}

install_clihub() {
  command -v uv >/dev/null 2>&1 || return 1
  uv tool install --force "cli-anything-hub==$CLIHUB_VERSION" || return
  check_version "cli-hub $CLIHUB_VERSION" cli-hub --version
}

install_graphify() {
  if ! command -v graphify >/dev/null 2>&1; then
    command -v uv >/dev/null 2>&1 || return 1
    uv tool install graphifyy || return 1
  fi
  graphify --version >/dev/null
}

install_openspace() {
  local os_installer="$SCRIPT_DIR/../.agent-skills/openspace/scripts/install-openspace.sh"
  if [ ! -f "$os_installer" ]; then
    os_installer="$HOME/.agents/skills/openspace/scripts/install-openspace.sh"
  fi
  [ -f "$os_installer" ] || { printf 'OpenSpace installer not found.\n' >&2; return 1; }
  if [ "${JEO_SKILLS_APPROVE_ALL_HOOKS_MCP:-false}" = true ]; then
    bash "$os_installer" --hooks
  else
    bash "$os_installer" --skip-mcp
  fi
}

install_open_ontologies() {
  local oo_smoke="$SCRIPT_DIR/../.agent-skills/open-ontologies/scripts/smoke.py"
  local oo_install="$SCRIPT_DIR/../.agent-skills/open-ontologies/scripts/install.sh"
  if [ ! -f "$oo_smoke" ]; then
    oo_smoke="$HOME/.agents/skills/open-ontologies/scripts/smoke.py"
    oo_install="$HOME/.agents/skills/open-ontologies/scripts/install.sh"
  fi
  local oo_bin="${HOME}/.local/bin/open-ontologies"
  [ -x "$oo_bin" ] || oo_bin="$(command -v open-ontologies 2>/dev/null || true)"
  if [ -n "$oo_bin" ] && [ -x "$oo_bin" ] && [ -f "$oo_smoke" ]; then
    python3 "$oo_smoke" --binary "$oo_bin" >/dev/null
  elif [ "${OPEN_ONTOLOGIES_BUILD_APPROVED:-0}" = 1 ] && [ -f "$oo_install" ]; then
    bash "$oo_install"
  else
    printf 'open-ontologies binary not installed (set OPEN_ONTOLOGIES_BUILD_APPROVED=1 to build from source).\n' >&2
    return 1
  fi
}

install_okf_agent_memory() {
  local okf_smoke="$SCRIPT_DIR/../.agent-skills/okf-agent-memory/scripts/smoke.py"
  if [ ! -f "$okf_smoke" ]; then
    okf_smoke="$HOME/.agents/skills/okf-agent-memory/scripts/smoke.py"
  fi
  local okf_bin
  okf_bin="$(PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" command -v okf 2>/dev/null || true)"
  if [ -n "$okf_bin" ] && [ -x "$okf_bin" ] && [ -f "$okf_smoke" ]; then
    python3 "$okf_smoke" --binary "$okf_bin" >/dev/null
  else
    printf 'okf binary not found on PATH.\n' >&2
    return 1
  fi
}

record mex install_mex
record zvec-grep install_zvec_grep
record spec-kit install_spec_kit
record RTK install_rtk
record Semble install_semble
record CLI-Hub install_clihub

if [ "$EXTENDED" = 1 ]; then
  total_tools=10
  record Graphify install_graphify
  record OpenSpace install_openspace
  record Open-Ontologies install_open_ontologies
  record OKF-Agent-Memory install_okf_agent_memory
fi

if [ "$PROGRAMS" = 1 ]; then
  printf '\n==> Program readiness (offline and read-only; not counted in the tool total)\n'
  router="$SCRIPT_DIR/../.agent-skills/jeo-skill/scripts/jeo-skill.py"
  [ -f "$router" ] || router="$HOME/.agents/skills/jeo-skill/scripts/jeo-skill.py"
  if [ -f "$router" ]; then
    python3 "$router" readiness --global || [ "$?" -le 1 ] || printf 'WARNING: the readiness report could not run.\n' >&2
  else
    printf 'WARNING: jeo-skill router not found; skipping the readiness report.\n' >&2
  fi
fi

printf '\nFull-tool result: %s/%s succeeded.\n' "${#successes[@]}" "$total_tools"
printf 'Succeeded:'; if [ "${#successes[@]}" -gt 0 ]; then printf ' %s' "${successes[@]}"; fi; printf '\n'
if [ "${#failures[@]}" -gt 0 ]; then
  printf 'PARTIAL SUCCESS - failed:' >&2
  printf ' %s' "${failures[@]}" >&2
  printf '\n' >&2
  exit 1
fi
if [ "$EXTENDED" = 1 ]; then
  printf 'All %s extended full-mode tool setup attempts succeeded; optional integration activation and readiness may require separate approval and verification.\n' "$total_tools"
else
  printf 'All six full-mode tools installed and executable.\n'
fi
