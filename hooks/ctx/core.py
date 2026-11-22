"""Shared contract for the `ctx` context-lifecycle tool.

Every layer module (ctx.layers.<name>) implements:

    plan(ctx: Context) -> list[Action]       # pure, no side effects
    apply(action: Action, ctx: Context)      # idempotent; no-op when ctx.dry_run
    refresh(ctx: Context) -> dict            # light incremental (TaskCompleted/SessionEnd)
    status(ctx: Context) -> dict             # read-only freshness facts

Optional per-layer hooks (all read-only):

    REFRESH_DESCRIPTION: str                 # one line shown as `DRY-RUN regenerate` inventory
    evidence_roots(ctx) -> list[Path]        # dirs inventoried for --evidence before/after

Stdlib only, Python >= 3.9.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable, List, Optional, Sequence

# --------------------------------------------------------------------------- #
# Constants
# --------------------------------------------------------------------------- #

LAYERS: Sequence[str] = ("mex", "zvec", "vault", "graphify")
SCOPES: Sequence[str] = ("all",) + tuple(LAYERS)
ACTION_KINDS: Sequence[str] = ("delete", "archive", "regenerate", "purge", "rotate", "note")
GC_KINDS: Sequence[str] = ("delete", "archive", "purge", "rotate")
MUTATING_KINDS: Sequence[str] = ("delete", "archive", "regenerate", "purge", "rotate")


def resolve_canonical_vault() -> Path:
    hooks_root = Path(__file__).resolve().parent.parent
    if str(hooks_root) not in sys.path:
        sys.path.insert(0, str(hooks_root))
    try:
        from context_config import resolve_wiki_vault

        return resolve_wiki_vault(prefer_ctx_env=True)
    except Exception:
        for var in ("CTX_VAULT", "LLM_WIKI_VAULT"):
            val = (os.environ.get(var) or "").strip()
            if val:
                return Path(val).expanduser()
        return Path.home() / "vaults" / "llm-wiki"


def resolve_tool_bin(name: str, env_var: Optional[str] = None) -> Path:
    if env_var:
        override = (os.environ.get(env_var) or "").strip()
        if override:
            return Path(override).expanduser()
    found = shutil.which(name)
    if found:
        return Path(found)
    local = Path.home() / ".local" / "bin" / name
    if local.exists():
        return local
    nvm_base = Path.home() / ".nvm" / "versions" / "node"
    if nvm_base.is_dir():
        for candidate in sorted(nvm_base.glob(f"*/bin/{name}"), reverse=True):
            if candidate.exists():
                return candidate
    return local


CANONICAL_VAULT = resolve_canonical_vault()
HOOKS_HOME = Path.home() / ".agents" / "hooks"
PACKAGE_HOME = HOOKS_HOME / "ctx"
LOCK_DIR = PACKAGE_HOME / "locks"
LOG_DIR = PACKAGE_HOME / "logs"
SHIM_PATH = Path.home() / ".local" / "bin" / "ctx"
MEX_AGENT = resolve_tool_bin("mex-agent", "CTX_MEX_BIN")
ZG = resolve_tool_bin("zg", "CTX_ZG_BIN")

RAW_EXEMPT_SEGMENTS: Sequence[Sequence[str]] = (("raw", "sources"), ("Clippings",))

DEFAULT_GRACE_SECONDS = 600
DEFAULT_TTL_DAYS = 30


# --------------------------------------------------------------------------- #
# Data model
# --------------------------------------------------------------------------- #


@dataclass
class Action:
    """One planned mutation."""

    kind: str  # 'delete' | 'archive' | 'regenerate' | 'purge' | 'rotate' | 'note'
    layer: str  # 'mex' | 'zvec' | 'vault' | 'graphify'
    path: str  # absolute source path
    reason: str
    dest: Optional[str] = None  # archive destination
    bytes: int = 0

    def describe(self) -> str:
        parts = [self.kind.upper(), self.layer, self.path]
        if self.dest:
            parts.append("-> " + self.dest)
        if self.bytes:
            parts.append("(" + human_bytes(self.bytes) + ")")
        parts.append("# " + self.reason)
        return " ".join(parts)

    def to_record(self) -> dict:
        return {
            "kind": self.kind,
            "layer": self.layer,
            "path": self.path,
            "reason": self.reason,
            "dest": self.dest,
            "bytes": self.bytes,
        }


@dataclass
class Context:
    vault: Path
    repo: Optional[Path]
    now: datetime
    dry_run: bool
    grace_seconds: int = DEFAULT_GRACE_SECONDS
    ttl_days: int = DEFAULT_TTL_DAYS
    ledger_path: Optional[Path] = None  # defaults to <vault>/wiki/ctx-ledger.jsonl
    log: Callable[[str], None] = field(default=lambda msg: sys.stderr.write(msg + "\n"))
    scope: str = "all"

    def __post_init__(self) -> None:
        self.vault = Path(self.vault).expanduser()
        if self.repo is not None:
            self.repo = Path(self.repo).expanduser()
        if self.ledger_path is None:
            self.ledger_path = default_ledger_path(self.vault)
        else:
            self.ledger_path = Path(self.ledger_path)
        if self.now.tzinfo is None:
            self.now = self.now.replace(tzinfo=timezone.utc)

    # -- helpers used by every layer ---------------------------------------- #

    def grace_cutoff(self) -> float:
        """Epoch seconds; files with mtime >= cutoff are inside the grace window."""
        return self.now.timestamp() - self.grace_seconds

    def ttl_cutoff(self) -> float:
        return self.now.timestamp() - self.ttl_days * 86400

    def in_grace(self, path: Path) -> bool:
        try:
            return path.stat().st_mtime >= self.grace_cutoff()
        except OSError:
            return True  # vanished/unreadable: treat as in-flight, never touch

    def older_than_ttl(self, path: Path) -> bool:
        try:
            return path.stat().st_mtime < self.ttl_cutoff()
        except OSError:
            return False


def default_ledger_path(vault: Path) -> Path:
    return Path(vault) / "wiki" / "ctx-ledger.jsonl"


# --------------------------------------------------------------------------- #
# Raw exemption
# --------------------------------------------------------------------------- #


def is_raw_exempt(path: "str | os.PathLike[str]") -> bool:
    """True when ANY segment window of the path matches a raw-exempt marker.

    Checked against the absolute path parts so it also fires for
    `wiki/archive/roots/<slug>/raw/sources/...` and any `Clippings` dir.
    """
    parts = Path(path).parts
    for marker in RAW_EXEMPT_SEGMENTS:
        n = len(marker)
        for i in range(len(parts) - n + 1):
            if tuple(parts[i : i + n]) == tuple(marker):
                return True
    return False


def assert_not_raw(action: Action) -> None:
    for p in (action.path, action.dest):
        if p and is_raw_exempt(p):
            raise PermissionError("raw-exempt path may never be an Action target: %s" % p)


# --------------------------------------------------------------------------- #
# Context construction
# --------------------------------------------------------------------------- #


def git_toplevel(start: Optional[Path] = None) -> Optional[Path]:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=str(start or Path.cwd()),
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if out.returncode != 0:
        return None
    top = out.stdout.strip()
    return Path(top) if top else None


def dry_run_forced() -> bool:
    """`CTX_DRY_RUN=1` (or true/yes/on) forces dry-run for every mutating command."""
    val = os.environ.get("CTX_DRY_RUN", "").strip().lower()
    return val in ("1", "true", "yes", "on")


def build_context(args, log: Optional[Callable[[str], None]] = None) -> Context:
    """Resolve --vault / --repo defaults from an argparse namespace."""
    vault = Path(getattr(args, "vault", None) or resolve_canonical_vault())
    repo_arg = getattr(args, "repo", None)
    if repo_arg:
        repo: Optional[Path] = Path(repo_arg).expanduser().resolve()
    else:
        repo = git_toplevel()
    dry_run = bool(getattr(args, "dry_run", False))
    forced = dry_run_forced()
    ctx = Context(
        vault=vault.expanduser(),
        repo=repo,
        now=datetime.now(timezone.utc),
        dry_run=dry_run or forced,
        grace_seconds=int(getattr(args, "grace_seconds", DEFAULT_GRACE_SECONDS) or DEFAULT_GRACE_SECONDS),
        ttl_days=int(getattr(args, "ttl_days", DEFAULT_TTL_DAYS) or DEFAULT_TTL_DAYS),
        scope=getattr(args, "scope", "all") or "all",
    )
    if log is not None:
        ctx.log = log
    if forced and not dry_run:
        ctx.log("dry-run forced by CTX_DRY_RUN")
    return ctx


def resolve_scope(scope: str) -> List[str]:
    if scope == "all":
        return list(LAYERS)
    if scope in LAYERS:
        return [scope]
    raise ValueError("unknown scope: %s (expected one of %s)" % (scope, ", ".join(SCOPES)))


# --------------------------------------------------------------------------- #
# Filesystem helpers (atomic writes, manifests)
# --------------------------------------------------------------------------- #


def atomic_write_text(path: Path, text: str, mode: int = 0o644) -> None:
    """Write to a temp file in the same directory, fsync, then rename over `path`."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="." + path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, str(path))
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def atomic_write_bytes(path: Path, data: bytes, mode: int = 0o644) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix="." + path.name + ".", suffix=".tmp", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, str(path))
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def append_line(path: Path, line: str) -> None:
    """Append-only write (O_APPEND is atomic for short writes on POSIX)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(line.rstrip("\n") + "\n")


def iter_files(root: Path, exclude: Iterable[str] = ()) -> Iterable[Path]:
    """Yield regular files under root (no symlink following). `exclude` = relative prefixes."""
    root = Path(root)
    if not root.is_dir():
        return
    ex = tuple(str(e).rstrip("/") for e in exclude)
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        rel_dir = os.path.relpath(dirpath, root)
        rel_dir = "" if rel_dir == "." else rel_dir
        # prune excluded dirs
        dirnames[:] = [
            d for d in dirnames if not _rel_excluded(os.path.join(rel_dir, d) if rel_dir else d, ex)
        ]
        for fn in filenames:
            rel = os.path.join(rel_dir, fn) if rel_dir else fn
            if _rel_excluded(rel, ex):
                continue
            p = Path(dirpath) / fn
            if p.is_symlink():
                continue
            yield p


def _rel_excluded(rel: str, ex: Sequence[str]) -> bool:
    for e in ex:
        if rel == e or rel.startswith(e + "/"):
            return True
    return False


def manifest(root: Path, exclude: Iterable[str] = ()) -> dict:
    """Inventory of a directory (or a single file): file count, bytes, newest mtime,
    sha256 of sorted `path|size|mtime` lines. A file root is inventoried as itself so
    rewritten singletons such as index.md / log.md show up in evidence."""
    root = Path(root)
    lines: List[str] = []
    total = 0
    newest = 0.0
    count = 0
    if root.is_file():
        files = [root]
    else:
        files = iter_files(root, exclude)
    for p in files:
        try:
            st = p.stat()
        except OSError:
            continue
        count += 1
        total += st.st_size
        newest = max(newest, st.st_mtime)
        rel = p.name if p == root else p.relative_to(root).as_posix()
        lines.append("%s|%d|%d" % (rel, st.st_size, int(st.st_mtime)))
    lines.sort()
    digest = hashlib.sha256("\n".join(lines).encode("utf-8")).hexdigest()
    return {
        "root": str(root),
        "exists": root.exists(),
        "files": count,
        "bytes": total,
        "newest_mtime": iso(newest) if newest else None,
        "sha256": digest,
    }


# --------------------------------------------------------------------------- #
# Process helpers
# --------------------------------------------------------------------------- #


def run(
    cmd: Sequence[str],
    cwd: Optional[Path] = None,
    timeout: int = 600,
    env: Optional[dict] = None,
    check: bool = False,
) -> subprocess.CompletedProcess:
    full_env = dict(os.environ)
    if env:
        full_env.update(env)
    try:
        cp = subprocess.run(
            list(cmd),
            cwd=str(cwd) if cwd else None,
            capture_output=True,
            text=True,
            timeout=timeout,
            env=full_env,
        )
    except FileNotFoundError as exc:
        cp = subprocess.CompletedProcess(list(cmd), 127, "", str(exc))
    except subprocess.TimeoutExpired as exc:
        cp = subprocess.CompletedProcess(list(cmd), 124, exc.stdout or "", "timeout after %ss" % timeout)
    if check and cp.returncode != 0:
        raise RuntimeError("%s failed (%s): %s" % (" ".join(cmd), cp.returncode, (cp.stderr or cp.stdout).strip()[:500]))
    return cp


def pid_alive(pid: int) -> bool:
    try:
        os.kill(int(pid), 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except (OSError, ValueError):
        return False
    return True


def lsof_holders(path: Path) -> List[int]:
    """PIDs holding `path` open (empty when lsof is missing or nothing holds it)."""
    cp = run(["lsof", "-t", "--", str(path)], timeout=20)
    if cp.returncode not in (0, 1):
        return []
    pids = []
    for tok in cp.stdout.split():
        try:
            pids.append(int(tok))
        except ValueError:
            pass
    return pids


def version_tuple(text: str) -> tuple:
    out = []
    for tok in text.strip().split(".")[:3]:
        digits = ""
        for ch in tok:
            if ch.isdigit():
                digits += ch
            else:
                break
        out.append(int(digits) if digits else 0)
    while len(out) < 3:
        out.append(0)
    return tuple(out)


# --------------------------------------------------------------------------- #
# Formatting
# --------------------------------------------------------------------------- #


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_iso() -> str:
    return iso(time.time())


def human_bytes(n: int) -> str:
    n = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return ("%d%s" % (n, unit)) if unit == "B" else ("%.1f%s" % (n, unit))
        n /= 1024
    return "%dB" % n


def file_size(path: Path) -> int:
    try:
        return Path(path).stat().st_size
    except OSError:
        return 0


def tree_size(path: Path) -> int:
    return sum(file_size(p) for p in iter_files(Path(path)))


# --------------------------------------------------------------------------- #
# Layer loading
# --------------------------------------------------------------------------- #


def load_layer(name: str):
    """Import ctx.layers.<name>; raises ImportError if the module is missing."""
    import importlib

    if name not in LAYERS:
        raise ValueError("unknown layer: %s" % name)
    return importlib.import_module("ctx.layers." + name)


def ensure_dirs() -> None:
    for d in (LOCK_DIR, LOG_DIR):
        d.mkdir(parents=True, exist_ok=True)
