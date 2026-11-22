"""mex-agent layer: `<repo>/.mex/` + graph.db (regenerable SQLite code graph).

Facts (mex-agent 0.8.3, verified with --help):
  graph status  --root R --json   read-only freshness
  graph refresh --root R --json   incremental, in place (used by `ctx refresh`)
  graph rebuild --root R --json   isolated build + validate + atomic publish (checkpoint)
Never: bare `mex` (TeX Live), `npx mex`, `check`/`doctor`/`sync` from automation.

Prunable (regenerable) files inside .mex/ — everything else is canonical scaffold:
  graph.db-wal / graph.db-shm   stale SQLite sidecars (only when 0-byte wal, no holder, past grace)
  graph.db.recovery-* / .candidate-* / .rollback-*   maintenance leftovers (past grace, live graph healthy)
  graph.db.bak-*                legacy ctx backups (past grace)
"""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import List, Optional

from ctx.core import (
    MEX_AGENT,
    Action,
    Context,
    file_size,
    iso,
    lsof_holders,
    run,
    version_tuple,
)

LAYER = "mex"
MIN_VERSION = (0, 8, 3)
REFRESH_DESCRIPTION = "mex-agent graph refresh --root <repo> --json (incremental, in place)"
LEFTOVER_RE = re.compile(r"^graph\.db\.(recovery|candidate|rollback)-[0-9a-z]+$")
BAK_RE = re.compile(r"^graph\.db\.bak-")


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #


def mex_dir(ctx: Context) -> Optional[Path]:
    if ctx.repo is None:
        return None
    d = ctx.repo / ".mex"
    return d if d.is_dir() else None


def agent_version() -> Optional[str]:
    if not MEX_AGENT.exists():
        return None
    cp = run([str(MEX_AGENT), "--version"], timeout=30)
    if cp.returncode != 0:
        return None
    return cp.stdout.strip().splitlines()[-1].strip() if cp.stdout.strip() else None


def _graph_cmd(sub: str, ctx: Context, timeout: int = 600) -> dict:
    cp = run([str(MEX_AGENT), "graph", sub, "--root", str(ctx.repo), "--json"], cwd=ctx.repo, timeout=timeout)
    out = (cp.stdout or "").strip()
    data: dict = {}
    if out:
        try:
            data = json.loads(out)
        except ValueError:
            # tolerate a leading banner line
            idx = out.find("{")
            if idx >= 0:
                try:
                    data = json.loads(out[idx:])
                except ValueError:
                    data = {}
    data["_rc"] = cp.returncode
    if cp.returncode != 0:
        data["_stderr"] = (cp.stderr or cp.stdout or "").strip()[-800:]
    return data


def graph_status(ctx: Context) -> dict:
    if ctx.repo is None:
        return {"error": "no repo"}
    return _graph_cmd("status", ctx, timeout=120)


def _git_head_epoch(repo: Path) -> Optional[int]:
    cp = run(["git", "log", "-1", "--format=%ct"], cwd=repo, timeout=20)
    try:
        return int(cp.stdout.strip())
    except ValueError:
        return None


def files_count(db: Path) -> Optional[int]:
    """`select count(*) from files` via an immutable URI (never creates sidecars)."""
    if not db.is_file():
        return None
    uri = "file:%s?immutable=1" % str(db)
    try:
        con = sqlite3.connect(uri, uri=True, timeout=5)
        try:
            return int(con.execute("select count(*) from files").fetchone()[0])
        finally:
            con.close()
    except sqlite3.Error:
        return None


def _gitignore_covers_graph(d: Path) -> bool:
    gi = d / ".gitignore"
    try:
        lines = [ln.strip() for ln in gi.read_text(encoding="utf-8").splitlines()]
    except OSError:
        return False
    return any(ln in ("graph.db*", "graph.db", "/graph.db*", "graph.db*/") or ln.startswith("graph.db*") for ln in lines)


def _sidecar_sweep(d: Path, ctx: Context, force: bool = False) -> List[str]:
    """Delete stale graph.db-wal/-shm only when: wal is 0 bytes, nothing holds them (lsof), past grace."""
    removed: List[str] = []
    db = d / "graph.db"
    wal, shm = d / "graph.db-wal", d / "graph.db-shm"
    if not (wal.exists() or shm.exists()):
        return removed
    if not force and file_size(wal) != 0:
        return removed
    for p in (db, wal, shm):
        if p.exists() and lsof_holders(p):
            return removed
    for p in (wal, shm):
        if p.exists() and (force or not ctx.in_grace(p)):
            if ctx.dry_run:
                continue
            try:
                p.unlink()
                removed.append(str(p))
            except OSError:
                pass
    return removed


# --------------------------------------------------------------------------- #
# contract
# --------------------------------------------------------------------------- #


def plan(ctx: Context) -> List[Action]:
    actions: List[Action] = []
    ver = agent_version()
    if ver is None or version_tuple(ver) < MIN_VERSION:
        actions.append(
            Action("note", LAYER, str(MEX_AGENT), "mex-agent %s < %s; upgrade before relying on graph rebuild" % (ver, ".".join(map(str, MIN_VERSION))))
        )
    d = mex_dir(ctx)
    if d is None:
        actions.append(Action("note", LAYER, str(ctx.repo or "-"), "no <repo>/.mex directory; nothing to regenerate"))
        return actions
    db = d / "graph.db"
    actions.append(
        Action(
            "regenerate",
            LAYER,
            str(db),
            "mex-agent graph rebuild --root <repo> --json (isolated build, validated, atomic publish)",
            bytes=file_size(db),
        )
    )
    # Was the live graph recognised? Only then are maintenance leftovers safe to drop.
    st = graph_status(ctx) if db.is_file() else {}
    healthy = bool(st.get("inspected")) and st.get("status") in ("fresh", "stale")
    held = bool(lsof_holders(db)) if db.is_file() else False
    for p in sorted(d.iterdir()):
        name = p.name
        if BAK_RE.match(name):
            if ctx.in_grace(p):
                actions.append(Action("note", LAYER, str(p), "legacy backup inside grace window; skipped"))
            else:
                actions.append(Action("delete", LAYER, str(p), "legacy ctx graph backup past grace", bytes=file_size(p)))
            continue
        if LEFTOVER_RE.match(name):
            if ctx.in_grace(p):
                actions.append(Action("note", LAYER, str(p), "maintenance leftover inside grace window; skipped"))
            elif not healthy:
                actions.append(Action("note", LAYER, str(p), "kept: live graph.db not recognised as healthy (status=%s)" % st.get("status")))
            elif held:
                actions.append(Action("note", LAYER, str(p), "kept: graph.db currently held open by another process"))
            else:
                actions.append(Action("delete", LAYER, str(p), "superseded %s generation; live graph is %s" % (name.split(".")[2].split("-")[0], st.get("status")), bytes=file_size(p)))
    wal, shm = d / "graph.db-wal", d / "graph.db-shm"
    if wal.exists() or shm.exists():
        holders = []
        for p in (db, wal, shm):
            if p.exists():
                holders.extend(lsof_holders(p))
        if holders:
            actions.append(Action("note", LAYER, str(wal), "SQLite sidecars held open by pid(s) %s; left alone" % sorted(set(holders))))
        elif file_size(wal) != 0:
            actions.append(Action("note", LAYER, str(wal), "non-empty WAL with no holder (%d B); run `mex-agent graph repair`, not deleted" % file_size(wal)))
        else:
            for p in (wal, shm):
                if not p.exists():
                    continue
                if ctx.in_grace(p):
                    actions.append(Action("note", LAYER, str(p), "stale sidecar inside grace window; skipped"))
                else:
                    actions.append(Action("delete", LAYER, str(p), "stale SQLite sidecar (0-byte WAL, no holder)", bytes=file_size(p)))
    if not _gitignore_covers_graph(d):
        actions.append(Action("note", LAYER, str(d / ".gitignore"), ".mex/.gitignore lacks `graph.db*` — graph.db could be committed"))
    return actions


def apply(action: Action, ctx: Context) -> Optional[dict]:
    if ctx.dry_run or action.kind == "note":
        return None
    p = Path(action.path)
    if action.kind == "delete":
        if not p.exists():
            return {"skipped": "already gone"}
        if p.name in ("graph.db-wal", "graph.db-shm"):
            d = p.parent
            if lsof_holders(d / "graph.db") or lsof_holders(p):
                raise RuntimeError("sidecar is held open; not deleted")
        if not (BAK_RE.match(p.name) or LEFTOVER_RE.match(p.name) or p.name in ("graph.db-wal", "graph.db-shm")):
            raise PermissionError("mex layer only deletes graph.db sidecars/leftovers, not %s" % p.name)
        size = file_size(p)
        p.unlink()
        return {"deleted": str(p), "bytes": size}
    if action.kind == "regenerate":
        if ctx.repo is None:
            raise RuntimeError("no repo")
        res = _graph_cmd("rebuild", ctx, timeout=900)
        if res.get("_rc") != 0 or res.get("state") not in (None, "succeeded"):
            raise RuntimeError("graph rebuild failed: %s" % (res.get("_stderr") or res.get("state") or res.get("diagnostics")))
        st = res.get("status") or {}
        return {
            "state": res.get("state"),
            "durationMs": res.get("durationMs"),
            "status": st.get("status"),
            "indexedHead": st.get("indexedHead"),
            "parsed": (st.get("parseHealth") or {}).get("total"),
            "bytes": file_size(Path(action.path)),
        }
    raise ValueError("mex layer cannot apply kind=%s" % action.kind)


def refresh(ctx: Context) -> dict:
    """Incremental graph refresh (hook-safe). Caller holds the mex layer lock."""
    d = mex_dir(ctx)
    if d is None:
        return {"skipped": "no .mex directory", "repo": str(ctx.repo) if ctx.repo else None}
    ver = agent_version()
    if ver is None or version_tuple(ver) < MIN_VERSION:
        return {"skipped": "mex-agent %s < 0.8.3; refresh not run" % ver}
    if ctx.dry_run:
        return {"dry_run": True, "would_run": "mex-agent graph refresh --root %s --json" % ctx.repo}
    res = _graph_cmd("refresh", ctx, timeout=600)
    out = {
        "state": res.get("state"),
        "rc": res.get("_rc"),
        "durationMs": res.get("durationMs"),
        "status": (res.get("status") or {}).get("status"),
        "changes": (res.get("status") or {}).get("changes", {}).get("total"),
    }
    if res.get("_rc") != 0:
        out["error"] = res.get("_stderr")
    out["sidecars_removed"] = _sidecar_sweep(d, ctx)
    return out


def status(ctx: Context) -> dict:
    ver = agent_version()
    out: dict = {
        "agent": str(MEX_AGENT),
        "version": ver,
        "version_ok": bool(ver) and version_tuple(ver) >= MIN_VERSION,
        "repo": str(ctx.repo) if ctx.repo else None,
    }
    d = mex_dir(ctx)
    if d is None:
        out["present"] = False
        return out
    db = d / "graph.db"
    out["present"] = True
    out["graph_db"] = str(db)
    out["graph_db_bytes"] = file_size(db)
    try:
        db_mtime = db.stat().st_mtime
    except OSError:
        db_mtime = None
    head_epoch = _git_head_epoch(ctx.repo) if ctx.repo else None
    out["graph_db_mtime"] = iso(db_mtime) if db_mtime else None
    out["head_commit_time"] = iso(head_epoch) if head_epoch else None
    out["graph_newer_than_head"] = (db_mtime is not None and head_epoch is not None and db_mtime >= head_epoch)
    out["files_indexed"] = files_count(db)
    out["gitignore_covers_graph"] = _gitignore_covers_graph(d)
    out["leftovers"] = sorted(p.name for p in d.iterdir() if LEFTOVER_RE.match(p.name) or BAK_RE.match(p.name))
    out["sidecars"] = sorted(p.name for p in (d / "graph.db-wal", d / "graph.db-shm") if p.exists())
    if out["version_ok"] and db.is_file():
        st = graph_status(ctx)
        out["graph_status"] = st.get("status")
        out["indexed_head"] = st.get("indexedHead")
        out["current_head"] = (st.get("currentRepo") or {}).get("head")
        out["changes"] = (st.get("changes") or {}).get("total")
        out["schema_version"] = st.get("schemaVersion")
        if st.get("_rc") != 0:
            out["graph_status_error"] = st.get("_stderr")
    return out


def evidence_roots(ctx: Context) -> List[Path]:
    return [ctx.repo / ".mex"] if ctx.repo else []
