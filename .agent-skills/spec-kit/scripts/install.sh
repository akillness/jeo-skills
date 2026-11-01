#!/usr/bin/env bash
# spec-kit installer wrapper.
# Installs GitHub's `specify-cli` (spec-kit) via uv or pipx.
#
# Env knobs:
#   SPEC_KIT_REF       — Git ref / tag / SHA to pin (default: main)
#   SPEC_KIT_INTEGRATION — optional: integration to bootstrap after install
#                          (claude, copilot, gemini, codex, cursor, opencode,
#                           qwen, kiro, ...)
#   SPEC_KIT_PROJECT_DIR — optional: target dir to `specify init` into
#                          (default: skip init; only install the CLI)
#
# Usage:
#   bash scripts/install.sh
#   SPEC_KIT_REF=v0.0.10 bash scripts/install.sh
#   SPEC_KIT_INTEGRATION=claude SPEC_KIT_PROJECT_DIR=./my-app bash scripts/install.sh

set -euo pipefail

SPEC_KIT_REF="${SPEC_KIT_REF:-99e047e9b48c3ecbbc5c3e530fb45bed671960bc}"
SPEC_KIT_REPO="git+https://github.com/github/spec-kit.git@${SPEC_KIT_REF}"
export PATH="${HOME}/.local/bin:${PATH}"
echo "=== spec-kit installer ==="
echo "ref: ${SPEC_KIT_REF}"

if command -v uv >/dev/null 2>&1; then
  echo "[1/2] Installing specify-cli via uv tool install"
  uv tool install --force "specify-cli" --from "${SPEC_KIT_REPO}"
elif command -v pipx >/dev/null 2>&1; then
  echo "[1/2] uv not found — falling back to pipx"
  pipx install --force "${SPEC_KIT_REPO}"
else
  echo "ERROR: neither uv nor pipx is installed." >&2
  echo "  Install uv:   curl -LsSf https://astral.sh/uv/install.sh | sh" >&2
  echo "  Or pipx:      python3 -m pip install --user pipx && pipx ensurepath" >&2
  exit 1
fi

if ! command -v specify >/dev/null 2>&1; then
  echo "ERROR: 'specify' is not on PATH after install." >&2
  echo "  Make sure your tool bin dir is on PATH (uv: ~/.local/bin)." >&2
  exit 1
fi

echo "[2/2] specify $(specify --version 2>/dev/null || echo 'installed')"
specify integration list || true

if [ -n "${SPEC_KIT_INTEGRATION:-}" ] && [ -n "${SPEC_KIT_PROJECT_DIR:-}" ]; then
  echo ""
  echo "=== Bootstrapping project (safe absent-only merge) ==="
  mkdir -p "${SPEC_KIT_PROJECT_DIR}"
  TARGET_PROJECT_DIR="$(cd "${SPEC_KIT_PROJECT_DIR}" && pwd -P)"
  echo "dir:         ${TARGET_PROJECT_DIR}"
  if [ "${SPEC_KIT_INTEGRATION}" = "auto" ]; then
    SPEC_KIT_INTEGRATION=""
    for cand_agent in claude codex gemini opencode cursor copilot; do
      if command -v "$cand_agent" >/dev/null 2>&1; then
        SPEC_KIT_INTEGRATION="${SPEC_KIT_INTEGRATION:+$SPEC_KIT_INTEGRATION,}$cand_agent"
      fi
    done
    SPEC_KIT_INTEGRATION="${SPEC_KIT_INTEGRATION:-codex}"
  fi
  echo "integration: ${SPEC_KIT_INTEGRATION}"
  stage=$(mktemp -d "${TMPDIR:-/tmp}/jeo-spec-kit.XXXXXX")
  manifest="$stage/collisions.txt"
  merge_status=0
  for integ in $(printf '%s' "${SPEC_KIT_INTEGRATION}" | tr ',' ' '); do
    [ -n "$integ" ] || continue
    if ! (cd "$stage" && specify init --here --force --non-interactive --integration "$integ"); then
      rm -rf "$stage"
      exit 1
    fi
  done
  python3 - "$stage" "$TARGET_PROJECT_DIR" "$manifest" <<'PY' || merge_status=$?
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
  [ "$merge_status" -eq 0 ] || exit "$merge_status"
fi

echo ""
echo "Done. Next:"
echo "  specify init my-project --integration claude"
echo "  cd my-project && open it in your AI agent, then run /speckit.constitution"
