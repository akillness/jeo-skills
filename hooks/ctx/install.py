"""`ctx install shim` and `ctx install pre-push --repo P`.

pre-push chaining: the ctx block is inserted in front of the existing Git LFS
hook body, which is preserved verbatim. Idempotent via the marker comments
`# ctx-checkpoint` … `# /ctx-checkpoint` (shared with HooksWiring).
"""
from __future__ import annotations

import os
import stat
import subprocess
from pathlib import Path

from ctx.core import HOOKS_HOME, LOG_DIR, SHIM_PATH, atomic_write_text

MARKER_BEGIN = "# ctx-checkpoint"
MARKER_END = "# /ctx-checkpoint"

SHIM_TEXT = """#!/bin/sh
# ctx — context-lifecycle tool (installed by `ctx install shim`)
PYTHONPATH="${HOME}/.agents/hooks${PYTHONPATH:+:$PYTHONPATH}" exec python3 -m ctx "$@"
"""

LFS_DEFAULT = """#!/bin/sh
command -v git-lfs >/dev/null 2>&1 || { printf >&2 "\\n%s\\n\\n" "This repository is configured for Git LFS but 'git-lfs' was not found on your path. If you no longer wish to use Git LFS, remove this hook by deleting the 'pre-push' file in the hooks directory (set by 'core.hookspath'; usually '.git/hooks')."; exit 2; }
git lfs pre-push "$@"
"""


def shim(path: Path = SHIM_PATH) -> Path:
    path = Path(path)
    atomic_write_text(path, SHIM_TEXT, mode=0o755)
    return path


def _ctx_block() -> str:
    log = str(LOG_DIR / "pre-push.log").replace(str(Path.home()), "$HOME", 1)
    # NB: keep the literal token `ctx checkpoint` (only $HOME is quoted) — verifiers grep for it.
    # The repo is derived from the pushing worktree at runtime: git runs pre-push with
    # cwd at the worktree top, so a hook shared by linked worktrees checkpoints the
    # worktree that is actually pushing, not the one it was installed from.
    return (
        "%s\n"
        "# Context-lifecycle checkpoint (ctx); best-effort, never blocks the push.\n"
        "# CTX_DRY_RUN=1 in the pushing shell is inherited and forces an inventory-only run.\n"
        'mkdir -p "$HOME/.agents/hooks/ctx/logs" 2>/dev/null\n'
        '_ctx_repo="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"\n'
        '[ -x "$HOME"/.local/bin/ctx ] && "$HOME"/.local/bin/ctx checkpoint --scope all --repo "$_ctx_repo" >> "%s" 2>&1 || true\n'
        "%s\n"
    ) % (MARKER_BEGIN, log, MARKER_END)


def hook_path(repo: Path) -> Path:
    """Where git will actually look for this repo's pre-push hook.

    `git rev-parse --git-path hooks/pre-push` honours core.hooksPath and, for a
    linked worktree, resolves to the *common* hooks directory (git never reads
    `<common>/worktrees/<name>/hooks`). Falls back to `<repo>/.git/hooks` only
    when git is unavailable.
    """
    repo = Path(repo)
    try:
        out = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "--git-path", "hooks/pre-push"],
            capture_output=True, text=True, check=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return repo / ".git" / "hooks" / "pre-push"
    p = Path(out)
    return p if p.is_absolute() else (repo / p).resolve()


def _strip_block(text: str) -> str:
    """Remove an existing marker block (and its trailing newline) if present."""
    lines = text.splitlines(keepends=True)
    out = []
    skipping = False
    for line in lines:
        s = line.strip()
        if not skipping and s == MARKER_BEGIN:
            skipping = True
            continue
        if skipping:
            if s == MARKER_END:
                skipping = False
            continue
        out.append(line)
    return "".join(out)


def pre_push(repo: Path) -> Path:
    repo = Path(repo)
    hook = hook_path(repo)
    hook.parent.mkdir(parents=True, exist_ok=True)
    original = hook.read_text(encoding="utf-8") if hook.is_file() else LFS_DEFAULT
    body = _strip_block(original)
    if not body.startswith("#!"):
        body = "#!/bin/sh\n" + body
    shebang, _, rest = body.partition("\n")
    rest = rest.lstrip("\n")
    new_text = shebang + "\n" + _ctx_block() + rest
    if not new_text.endswith("\n"):
        new_text += "\n"
    mode = 0o755
    if hook.is_file():
        mode = stat.S_IMODE(hook.stat().st_mode) | 0o111
    atomic_write_text(hook, new_text, mode=mode)
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    return hook


def is_installed(repo: Path) -> bool:
    hook = hook_path(Path(repo))
    try:
        text = hook.read_text(encoding="utf-8")
    except OSError:
        return False
    return MARKER_BEGIN in text and "ctx" in text and "checkpoint" in text
