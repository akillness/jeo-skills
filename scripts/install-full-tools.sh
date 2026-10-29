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
  npm install -g "mex-agent@$MEX_VERSION" || return
  check_version "$MEX_VERSION" mex --version
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
  local stage manifest merge_status=0
  stage=$(mktemp -d "${TMPDIR:-/tmp}/jeo-spec-kit.XXXXXX") || return
  manifest="$stage/collisions.txt"
  if ! (cd "$stage" && specify init --here --force --non-interactive --integration "$SPEC_KIT_INTEGRATION"); then
    rm -rf "$stage"
    return 1
  fi
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
try:
    for component in target.parts[1:]:
        next_fd = os.open(component, flags, dir_fd=root_fd)
        os.close(root_fd)
        root_fd = next_fd

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
  command -v cargo >/dev/null 2>&1 || { printf 'cargo is required for pinned RTK installation.\n' >&2; return 1; }
  if [ "$(uname -s 2>/dev/null)" = Linux ] && [ "$(uname -m 2>/dev/null)" = aarch64 ]; then
    printf 'NOTE: RTK Linux ARM64 may fail because of glibc/toolchain compatibility; failure is recorded.\n' >&2
  fi
  cargo install --git https://github.com/rtk-ai/rtk --tag "v$RTK_VERSION" --locked --force rtk || return
  check_version "rtk $RTK_VERSION" rtk --version && rtk gain >/dev/null
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

record mex install_mex
record zvec-grep install_zvec_grep
record spec-kit install_spec_kit
record RTK install_rtk
record Semble install_semble
record CLI-Hub install_clihub

printf '\nFull-tool result: %s/6 succeeded.\n' "${#successes[@]}"
printf 'Succeeded:'; if [ "${#successes[@]}" -gt 0 ]; then printf ' %s' "${successes[@]}"; fi; printf '\n'
if [ "${#failures[@]}" -gt 0 ]; then
  printf 'PARTIAL SUCCESS - failed:' >&2
  printf ' %s' "${failures[@]}" >&2
  printf '\n' >&2
  exit 1
fi
printf 'All six full-mode tools installed and executable.\n'
