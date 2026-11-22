"""zvec-grep layer: `<repo>/.zvec-grep/` (self-compacting index, watcher-maintained)
+ global daemon state under `~/.zvec-grep/daemon/`.

Policy (zvec-grep 0.2.2, flags verified with `zg help index|status|query|environment`):
  refresh()   hook path (TaskCompleted/SessionEnd): read-only `zg status <repo> --check-ready`
              + marker touch. NEVER `zg index` from hooks (watcher already reindexes).
  plan()      checkpoint path, FILESYSTEM/MANIFEST ONLY — it never runs `zg` (even
              `zg status` rewrites proxima segments in place, which would make a
              dry-run mutate the index). An existing index always gets a conservative
              incremental `regenerate` Action (missing/unreadable manifest → rebuild);
              apply() re-probes live readiness with `zg status` and skips when the
              daemon already reconciled. ctx never CREATES an index (no .zvec-grep → note).
  GC          rotate the unrotated daemon log (>100 MB) and delete sibling `.zvec-grep` dirs whose
              workspace is gone and untouched > 30 d.
"""
from __future__ import annotations

import json
import os
import re
import shutil
import time
from pathlib import Path
from typing import List, Optional

from ctx.core import ZG, Action, Context, atomic_write_bytes, file_size, iso, pid_alive, run, tree_size

LAYER = "zvec"
REFRESH_DESCRIPTION = "zg status <repo> --check-ready (read-only) + touch <repo>/.zvec-grep/.ctx-refresh-wanted"
ZVEC_HOME = Path(os.environ.get("ZVEC_GREP_HOME") or (Path.home() / ".zvec-grep"))
DAEMON_LOG = ZVEC_HOME / "daemon" / "logs" / "server.log"
INSTANCE_LOCK = ZVEC_HOME / "daemon" / "instance.lock"
LOG_ROTATE_BYTES = 100 * 1024 * 1024
LOG_KEEP_BYTES = 5 * 1024 * 1024
MARKER = ".ctx-refresh-wanted"
DEFAULT_EMBEDDING = "local/potion-code-16m-v2"
# CTX_ZVEC_REPO_ONLY=1 → plan() skips the global daemon-log rotation and sibling-root scan (hermetic tests).
REPO_ONLY_ENV = "CTX_ZVEC_REPO_ONLY"
SIBLING_ROOTS = (
    Path.home() / ".superset" / "projects",
    Path.home() / "Documents",
    Path.home() / "vaults",
    Path.home() / ".plannotator",
)
SIBLING_MAX_DEPTH = 5
SIBLING_STALE_DAYS = 30
PRUNE_DIRS = {"node_modules", "Library", ".venv", "venv", "__pycache__", "Pods", "Build", "Builds", "Logs", "Temp", "obj", "target", "dist"}


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def index_dir(ctx: Context) -> Optional[Path]:
    if ctx.repo is None:
        return None
    d = ctx.repo / ".zvec-grep"
    return d if d.is_dir() else None


def read_manifest(d: Path) -> Optional[dict]:
    try:
        return json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def daemon_pid() -> Optional[int]:
    try:
        data = json.loads(INSTANCE_LOCK.read_text(encoding="utf-8"))
        return int(data.get("pid"))
    except (OSError, ValueError, TypeError):
        return None


def daemon_alive() -> bool:
    pid = daemon_pid()
    return bool(pid) and pid_alive(pid)


LEASE_FRESH_SECONDS = 60  # daemon rewrites <index>/locks/daemon.json every 5 s while it owns the root


def manifest_roots(m: Optional[dict]) -> Optional[List[str]]:
    """Every `rootPaths[].absolutePath` from a manifest, or None when the list is
    missing/empty/malformed (callers must treat None as NOT safe to delete)."""
    roots = (m or {}).get("rootPaths")
    if not isinstance(roots, list) or not roots:
        return None
    out: List[str] = []
    for r in roots:
        p = r.get("absolutePath") if isinstance(r, dict) else None
        if not isinstance(p, str) or not p:
            return None
        out.append(p)
    return out


def index_owner(d: Path, now_ts: float) -> Optional[str]:
    """Why `d` is still owned/open, or None when nothing holds it.

    Checks the per-index daemon lease (`locks/daemon.json`: fresh updatedAt or a
    live pid) and any process with files under `d` open (lsof)."""
    lease = d / "locks" / "daemon.json"
    try:
        data = json.loads(lease.read_text(encoding="utf-8"))
        updated = data.get("updatedAt")
        if isinstance(updated, (int, float)) and now_ts - updated / 1000.0 < LEASE_FRESH_SECONDS:
            return "daemon lease fresh (updatedAt %s)" % iso(updated / 1000.0)
        pid = data.get("pid")
        if pid and pid_alive(int(pid)):
            return "daemon lease pid %s alive" % pid
    except (OSError, ValueError, TypeError):
        pass
    cp = run(["lsof", "-t", "+D", str(d)], timeout=30)
    holders = sorted({int(x) for x in cp.stdout.split() if x.strip().isdigit()}) if cp.returncode in (0, 1) else []
    if holders:
        return "files open by pid(s) %s" % ",".join(str(h) for h in holders[:5])
    return None


def orphan_reason(d: Path, m: Optional[dict], cutoff_ms: float, now_ts: float) -> Optional[str]:
    """Return the reason `d` is a safe-to-delete orphan, or None (fail closed).

    Safe only when: manifest readable; updatedTime older than cutoff; rootPaths is a
    valid non-empty list and EVERY root is gone; nothing owns/opens the index."""
    if m is None:
        return None
    updated = m.get("updatedTime")
    if not isinstance(updated, (int, float)) or updated >= cutoff_ms:
        return None
    roots = manifest_roots(m)
    if roots is None or any(Path(r).exists() for r in roots):
        return None
    if index_owner(d, now_ts) is not None:
        return None
    return "index untouched since %s and all %d workspace root(s) gone: %s" % (
        iso(updated / 1000.0), len(roots), ", ".join(roots[:3]))

def _git_head_epoch(repo: Path) -> Optional[int]:
    cp = run(["git", "log", "-1", "--format=%ct"], cwd=repo, timeout=20)
    try:
        return int(cp.stdout.strip())
    except ValueError:
        return None


_HEADINGS = {
    "Workspace index is ready": "ready",
    "Workspace index is updating": "indexing",
    "Workspace index needs an update": "stale",
    "Workspace index failed": "failed",
    "Workspace index update was cancelled": "cancelled",
    "Workspace indexing is disabled": "disabled",
    "Workspace index is not created": "unindexed",
    "Workspace index is not configured": "undecided",
}
_CHANGES_RE = re.compile(r"(\d[\d,]*)\s+added\s*·\s*(\d[\d,]*)\s+modified\s*·\s*(\d[\d,]*)\s+deleted")


def parse_status(text: str, rc: int) -> dict:
    """Parse `zg status [--check-ready]` human output (0.2.2 has no JSON; headings from cli/format/status.js)."""
    out: dict = {"rc": rc, "ready": rc == 0, "state": None, "changes": {"added": 0, "modified": 0, "deleted": 0}}
    for heading, state in _HEADINGS.items():
        if heading in text:
            out["state"] = state
            break
    if "state:" in text:  # `--check-ready` error line is authoritative
        out["state"] = text.split("state:", 1)[1].split(")", 1)[0].strip()
    if out["state"] is None:
        out["state"] = "ready" if rc == 0 else "unknown"
    m = _CHANGES_RE.search(text)
    if m:
        out["changes"] = {k: int(v.replace(",", "")) for k, v in zip(("added", "modified", "deleted"), m.groups())}
    for line in text.splitlines():
        s = line.strip()
        for key in ("Coverage", "Entities", "Queue", "Next", "Embedding"):
            if s.startswith(key + " "):
                out.setdefault(key.lower(), " ".join(s.split()[1:]))
    out["version_mismatch"] = ("VERSION_MISMATCH" in text) or ("index version is not supported" in text)
    out["error_text"] = text.strip()[-400:] if rc not in (0, 1) else ""
    return out


def check_ready(repo: Path) -> dict:
    """`zg status <repo> --check-ready` (read-only; rc 1 when not ready)."""
    cp = run([str(ZG), "status", str(repo), "--check-ready"], cwd=repo, timeout=120)
    return parse_status((cp.stdout or "") + (cp.stderr or ""), cp.returncode)


def static_decision(ctx: Context) -> dict:
    """Plan-time decision from the filesystem only (no `zg` invocation, no side effects).

    Returns {'rebuild': bool, 'reason': str}. Live readiness is evaluated by apply().
    """
    d = index_dir(ctx)
    manifest = read_manifest(d) if d is not None else None
    if manifest is None:
        return {"rebuild": True, "reason": "manifest.json missing/unreadable in existing .zvec-grep; `zg index --rebuild`"}
    updated_ms = manifest.get("updatedTime")
    head_epoch = _git_head_epoch(ctx.repo) if ctx.repo else None
    facts = []
    if isinstance(updated_ms, (int, float)) and head_epoch:
        facts.append("index %s HEAD (manifest %s, HEAD %s)" % (
            "behind" if updated_ms / 1000.0 < head_epoch else "not older than", iso(updated_ms / 1000.0), iso(head_epoch)))
    return {
        "rebuild": False,
        "reason": "checkpoint reconcile; `zg index <repo>` incremental, skipped at apply if `zg status` is already ready with 0 deleted resident"
        + ("; " + "; ".join(facts) if facts else ""),
    }


def regenerate_decision(ctx: Context) -> Optional[dict]:
    """Apply-time decision (probes `zg status`): None when the index needs nothing; else {'rebuild', 'reason', 'status'}."""
    d = index_dir(ctx)
    if d is None or ctx.repo is None:
        return None
    manifest = read_manifest(d)
    if manifest is None:
        return {"rebuild": True, "reason": "manifest.json missing/unreadable in existing .zvec-grep; `zg index --rebuild`", "status": {}}
    st = check_ready(ctx.repo)
    if st["version_mismatch"]:
        return {"rebuild": True, "reason": "index version not supported by zg %s; `zg index --rebuild`" % zg_version(), "status": st}
    deleted = st["changes"]["deleted"]
    if st["state"] in ("stale", "failed", "cancelled") or deleted > 0:
        why = "zg status: %s" % st["state"]
        if deleted:
            why += ", %d deleted file(s) still resident" % deleted
        why += " (%s added · %s modified)" % (st["changes"]["added"], st["changes"]["modified"])
        return {"rebuild": False, "reason": why + "; `zg index <repo>` incremental", "status": st}
    return None


def zg_version() -> Optional[str]:
    cp = run([str(ZG), "--version"], timeout=30)
    return cp.stdout.strip().splitlines()[-1].strip() if cp.returncode == 0 and cp.stdout.strip() else None


def embedding_for_rebuild(d: Path) -> str:
    m = read_manifest(d) or {}
    emb = m.get("embedding") or {}
    if emb.get("provider") and emb.get("model"):
        return "%s/%s" % (emb["provider"], emb["model"])
    return os.environ.get("ZVEC_GREP_EMBEDDING") or DEFAULT_EMBEDDING


def run_index(ctx: Context, rebuild: bool) -> dict:
    """`zg index <repo>` (incremental) or `zg index <repo> --rebuild --embedding <schema>`; raises on non-zero exit."""
    d = index_dir(ctx)
    if d is None or ctx.repo is None:
        raise RuntimeError("no <repo>/.zvec-grep to regenerate (ctx never creates indexes)")
    cmd = [str(ZG), "index", str(ctx.repo)]
    if rebuild:
        cmd += ["--rebuild", "--embedding", embedding_for_rebuild(d)]
    cp = run(cmd, cwd=ctx.repo, timeout=3600)
    text = (cp.stdout or "") + (cp.stderr or "")
    if cp.returncode != 0:
        raise RuntimeError("%s failed (rc=%s): %s" % (" ".join(cmd[1:]), cp.returncode, text.strip()[-400:]))
    files_line = next((ln.strip() for ln in text.splitlines() if ln.strip().startswith("files")), "")
    after = check_ready(ctx.repo)
    return {"command": " ".join(cmd[1:]), "files": files_line, "state_after": after["state"], "deleted_after": after["changes"]["deleted"], "ready_after": after["ready"]}


def stale_sibling_roots(ctx: Context) -> List[dict]:
    """`.zvec-grep` dirs (depth<=5 under SIBLING_ROOTS) whose manifest is >30d old AND whose workspace is gone."""
    found: List[dict] = []
    cutoff_ms = (ctx.now.timestamp() - SIBLING_STALE_DAYS * 86400) * 1000
    for base in SIBLING_ROOTS:
        if not base.is_dir():
            continue
        base_depth = len(base.parts)
        for dirpath, dirnames, _ in os.walk(base, followlinks=False):
            depth = len(Path(dirpath).parts) - base_depth
            if ".zvec-grep" in dirnames:
                d = Path(dirpath) / ".zvec-grep"
                m = read_manifest(d)
                updated = (m or {}).get("updatedTime")
                roots = manifest_roots(m)
                owner = index_owner(d, ctx.now.timestamp())
                entry = {
                    "path": str(d),
                    "roots": roots,
                    "roots_exist": [Path(r).exists() for r in roots] if roots else None,
                    "owner": owner,
                    "updated": iso(updated / 1000.0) if isinstance(updated, (int, float)) else None,
                    "bytes": tree_size(d),
                }
                entry["stale_reason"] = orphan_reason(d, m, cutoff_ms, ctx.now.timestamp())
                entry["stale"] = entry["stale_reason"] is not None
                found.append(entry)
            dirnames[:] = [
                n for n in dirnames if n != ".zvec-grep" and not n.startswith(".") and n not in PRUNE_DIRS
            ] if depth < SIBLING_MAX_DEPTH - 1 else []
    return found


def _wait_daemon(alive: bool, timeout: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if daemon_alive() == alive:
            return True
        time.sleep(0.25)
    return daemon_alive() == alive


def rotate_log(ctx: Context) -> dict:
    """zg server off → keep last LOG_KEEP_BYTES via temp+rename → zg server on."""
    size_before = file_size(DAEMON_LOG)
    was_alive = daemon_alive()
    if was_alive:
        run([str(ZG), "server", "off"], timeout=60)
        _wait_daemon(False, 20)
    try:
        with open(DAEMON_LOG, "rb") as fh:
            if size_before > LOG_KEEP_BYTES:
                fh.seek(size_before - LOG_KEEP_BYTES)
                tail = fh.read()
                nl = tail.find(b"\n")
                if 0 <= nl < len(tail) - 1:
                    tail = tail[nl + 1 :]
            else:
                tail = fh.read()
        header = ("# ctx rotate %s: kept last %d bytes of %d\n" % (iso(ctx.now.timestamp()), len(tail), size_before)).encode("utf-8")
        atomic_write_bytes(DAEMON_LOG, header + tail, mode=0o600)
    finally:
        if was_alive:
            run([str(ZG), "server", "on"], timeout=60)
            _wait_daemon(True, 20)
    return {"bytes_before": size_before, "bytes_after": file_size(DAEMON_LOG), "daemon_restarted": was_alive, "daemon_alive": daemon_alive()}


# --------------------------------------------------------------------------- #
# contract
# --------------------------------------------------------------------------- #


def plan(ctx: Context) -> List[Action]:
    actions: List[Action] = []
    if not ZG.exists():
        actions.append(Action("note", LAYER, str(ZG), "zg binary missing; zvec layer inert"))
        return actions
    d = index_dir(ctx)
    if d is None:
        actions.append(Action("note", LAYER, str(ctx.repo or "-"), "no <repo>/.zvec-grep; index absent (ctx never creates one — run `zg index <repo> --embedding …` yourself)"))
    else:
        decision = static_decision(ctx)
        actions.append(
            Action(
                "regenerate",
                LAYER,
                str(d),
                decision["reason"],
                dest="rebuild" if decision["rebuild"] else "incremental",
                bytes=tree_size(d),
            )
        )
    if os.environ.get(REPO_ONLY_ENV, "").strip() in ("1", "true", "yes", "on"):
        actions.append(Action("note", LAYER, str(DAEMON_LOG), "%s set: daemon-log rotation and sibling-root scan skipped" % REPO_ONLY_ENV))
        return actions
    size = file_size(DAEMON_LOG)
    if size > LOG_ROTATE_BYTES:
        actions.append(
            Action(
                "rotate",
                LAYER,
                str(DAEMON_LOG),
                "daemon log %d MB > %d MB; keep last %d MB (zg server off → temp+rename → zg server on)"
                % (size // (1024 * 1024), LOG_ROTATE_BYTES // (1024 * 1024), LOG_KEEP_BYTES // (1024 * 1024)),
                bytes=size,
            )
        )
    for entry in stale_sibling_roots(ctx):
        if entry["stale"]:
            actions.append(
                Action(
                    "delete",
                    LAYER,
                    entry["path"],
                    entry["stale_reason"],
                    bytes=entry["bytes"],
                )
            )
    return actions


def apply(action: Action, ctx: Context) -> Optional[dict]:
    if ctx.dry_run or action.kind == "note":
        return None
    p = Path(action.path)
    if action.kind == "regenerate":
        d = index_dir(ctx)
        if d is None or p.resolve() != d.resolve():
            raise PermissionError("zvec layer only regenerates <repo>/.zvec-grep, not %s" % p)
        decision = regenerate_decision(ctx)  # re-evaluate at apply time (daemon may have caught up)
        if decision is None:
            after = check_ready(ctx.repo)
            return {"skipped": "index already reconciled", "state_after": after["state"], "deleted_after": after["changes"]["deleted"]}
        return run_index(ctx, rebuild=decision["rebuild"])
    if action.kind == "rotate":
        if p != DAEMON_LOG:
            raise PermissionError("zvec layer only rotates %s" % DAEMON_LOG)
        if file_size(p) <= LOG_ROTATE_BYTES:
            return {"skipped": "below threshold now"}
        return rotate_log(ctx)
    if action.kind == "delete":
        if p.name != ".zvec-grep" or not p.is_dir():
            raise PermissionError("zvec layer only deletes `.zvec-grep` directories, not %s" % p)
        if ctx.repo and p.resolve() == (ctx.repo / ".zvec-grep").resolve():
            raise RuntimeError("refusing to delete the current repo's index")
        # Re-evaluate at apply time, fail closed: every root must still be gone and nothing may own the index.
        cutoff_ms = (ctx.now.timestamp() - SIBLING_STALE_DAYS * 86400) * 1000
        reason = orphan_reason(p, read_manifest(p), cutoff_ms, time.time())
        if reason is None:
            owner = index_owner(p, time.time())
            roots = manifest_roots(read_manifest(p))
            raise RuntimeError(
                "refusing to delete %s: %s" % (
                    p,
                    owner or ("workspace root(s) exist again: %s" % [r for r in (roots or []) if Path(r).exists()]
                              if roots else "manifest/rootPaths unreadable or empty"),
                )
            )
        size = tree_size(p)
        shutil.rmtree(p)
        return {"deleted": str(p), "bytes": size}
    raise ValueError("zvec layer cannot apply kind=%s" % action.kind)


def refresh(ctx: Context) -> dict:
    """Read-only readiness probe + marker touch (hook-safe; never `zg index`)."""
    out: dict = {"daemon_alive": daemon_alive()}
    d = index_dir(ctx)
    if d is None:
        out["skipped"] = "no .zvec-grep in repo"
        return out
    if not ZG.exists():
        out["skipped"] = "zg missing"
        return out
    if ctx.dry_run:
        out["dry_run"] = True
        out["would_run"] = "zg status %s --check-ready; touch %s" % (ctx.repo, d / MARKER)
        return out
    out.update(check_ready(ctx.repo))
    marker = d / MARKER
    try:
        marker.touch()
        out["marker"] = str(marker)
    except OSError as exc:
        out["marker_error"] = str(exc)
    return out


def status(ctx: Context) -> dict:
    out: dict = {
        "zg": str(ZG),
        "zg_present": ZG.exists(),
        "daemon_pid": daemon_pid(),
        "daemon_alive": daemon_alive(),
        "daemon_log": str(DAEMON_LOG),
        "daemon_log_bytes": file_size(DAEMON_LOG),
        "daemon_log_over_threshold": file_size(DAEMON_LOG) > LOG_ROTATE_BYTES,
        "repo": str(ctx.repo) if ctx.repo else None,
    }
    d = index_dir(ctx)
    if d is None:
        out["present"] = False
        return out
    out["present"] = True
    out["index_dir"] = str(d)
    out["index_bytes"] = tree_size(d)
    m = read_manifest(d) or {}
    updated_ms = m.get("updatedTime")
    head_epoch = _git_head_epoch(ctx.repo) if ctx.repo else None
    out["manifest_updated"] = iso(updated_ms / 1000.0) if isinstance(updated_ms, (int, float)) else None
    out["head_commit_time"] = iso(head_epoch) if head_epoch else None
    out["index_newer_than_head"] = bool(updated_ms) and bool(head_epoch) and updated_ms / 1000.0 >= head_epoch
    out["embedding"] = (m.get("embedding") or {}).get("model")
    lock = {}
    try:
        lock = json.loads((d / "locks" / "daemon.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    out["workspace_lock_pid"] = lock.get("pid")
    out["workspace_lock_alive"] = bool(lock.get("pid")) and pid_alive(int(lock["pid"]))
    out["refresh_marker"] = iso((d / MARKER).stat().st_mtime) if (d / MARKER).exists() else None
    if ZG.exists() and ctx.repo:
        out["check_ready"] = check_ready(ctx.repo)
    return out


def evidence_roots(ctx: Context) -> List[Path]:
    roots = [DAEMON_LOG.parent]
    if ctx.repo:
        roots.insert(0, ctx.repo / ".zvec-grep")
    return roots
