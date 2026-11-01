"""Per-layer advisory locks (fcntl.flock) with skip-if-locked semantics.

    from ctx.lock import layer_lock, Locked

    try:
        with layer_lock("vault"):
            ...
    except Locked:
        log("skip: vault layer locked"); sys.exit(0)

`layer_lock(name, wait_seconds=0)` raises `Locked` immediately when another
process holds the lock; with `wait_seconds > 0` it polls until acquired or
raises `Locked` after the deadline. `hold(name, seconds)` keeps a lock for a
fixed time (used by `ctx lock hold` and the race tests).

Locks live in ~/.agents/hooks/ctx/locks/<name>.lock. They are never deleted
(flock state lives in the kernel, the file is just the handle).
"""
from __future__ import annotations

import contextlib
import fcntl
import json
import os
import sys
import time
from pathlib import Path
from typing import Iterator, Optional

LOCK_DIR = Path.home() / ".agents" / "hooks" / "ctx" / "locks"
VALID_NAMES = ("mex", "zvec", "vault", "graphify")


class Locked(Exception):
    """Raised when a layer lock is held by another process."""

    def __init__(self, name: str, holder: Optional[dict] = None):
        self.name = name
        self.holder = holder or {}
        detail = ""
        if self.holder:
            detail = " (held by pid %s since %s)" % (self.holder.get("pid"), self.holder.get("since"))
        super().__init__("layer %r is locked%s" % (name, detail))


def lock_path(name: str) -> Path:
    if not name or "/" in name or name.startswith("."):
        raise ValueError("bad lock name: %r" % name)
    return LOCK_DIR / (name + ".lock")


def _read_holder(path: Path) -> Optional[dict]:
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    if not text:
        return None
    try:
        return json.loads(text)
    except ValueError:
        return {"raw": text[:120]}


def _write_holder(fd: int, name: str) -> None:
    payload = json.dumps(
        {
            "name": name,
            "pid": os.getpid(),
            "since": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "argv": os.environ.get("CTX_LOCK_LABEL") or " ".join([os.path.basename(sys.argv[0])] + sys.argv[1:4]),
        }
    )
    try:
        os.ftruncate(fd, 0)
        os.lseek(fd, 0, os.SEEK_SET)
        os.write(fd, payload.encode("utf-8"))
    except OSError:
        pass


@contextlib.contextmanager
def layer_lock(name: str, wait_seconds: float = 0) -> Iterator[Path]:
    """Exclusive, non-blocking lock on `name`; polls up to `wait_seconds` then raises Locked."""
    path = lock_path(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(str(path), os.O_RDWR | os.O_CREAT, 0o644)
    deadline = time.monotonic() + max(0.0, float(wait_seconds))
    try:
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except (BlockingIOError, OSError):
                if time.monotonic() >= deadline:
                    raise Locked(name, _read_holder(path))
                time.sleep(0.1)
        _write_holder(fd, name)
        try:
            yield path
        finally:
            try:
                os.ftruncate(fd, 0)
            except OSError:
                pass
            try:
                fcntl.flock(fd, fcntl.LOCK_UN)
            except OSError:
                pass
    finally:
        os.close(fd)


def is_locked(name: str) -> bool:
    """Probe without holding: True when another process currently holds the lock."""
    try:
        with layer_lock(name):
            return False
    except Locked:
        return True


def holder(name: str) -> Optional[dict]:
    """Best-effort holder metadata (only meaningful when is_locked(name))."""
    return _read_holder(lock_path(name))


def hold(name: str, seconds: float) -> None:
    """Hold the lock for `seconds` (blocking). Raises Locked if already held."""
    with layer_lock(name):
        time.sleep(max(0.0, float(seconds)))
