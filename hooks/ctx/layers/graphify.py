"""graphify layer: lifecycle of `<vault>/graphify-out/` (and the legacy `<vault>/.graphify/`).

Facts verified against graphifyy 0.8.14 source (site-packages/graphify):

* graph.json node schema (vault graph, 6857 nodes): keys are
  ``id, label, norm_label, file_type, source_file, source_location, community``
  (+ optional ``source_url, captured_at, author, contributor``). There is NO ``type``
  key — the node kind is ``file_type`` in {document, code, concept, rationale} and the
  source path is ``source_file`` (relative to the scan root; `watch._relativize_source_files`).
* watch.py:380-418 merges every node of the previous graph.json into the update output and
  only evicts nodes whose ``source_file`` is in ``changed_paths`` — the CLI never passes
  ``changed_paths``, so nodes of deleted files survive forever. Hence the reconciliation here.
* export.py:43 — ``GRAPHIFY_NO_BACKUP`` disables the dated snapshot dirs
  (``graphify-out/YYYY-MM-DD[_N]/``) that `backup_if_protected` creates on every overwrite
  while ``.graphify_semantic_marker`` exists. There is no retention/rotation in 0.8.14.
* cache.py:38-41 — the stat index is ``graphify-out/cache/stat-index.json``
  (abs path -> {size, mtime_ns, hash}); AST entries are ``cache/ast/<hash>.json``.
  ``clear_cache`` has no CLI, so orphan pruning is done here.
* detect.py:402 — ``.graphify`` is a hard-skipped noise dir; graphify never reads it.
  The dir is produced by ~/.agents/hooks/ingest-prompt.py (stops after VaultLayer's patch).
* `graphify update [--force] [--no-cluster]` (__main__.py:1852-1870) and
  `graphify cluster-only <path> [--no-viz]` (__main__.py:1756-1850) are the only flags used.
  ``cluster-only`` has no ``--help``; never probe it.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

from ctx import core
from ctx.core import Action, Context

LAYER = "graphify"
OUT_DIR = "graphify-out"
DOT_DIR = ".graphify"
ARCHIVE_OBSIDIAN = Path("wiki") / "archive" / "graphify-obsidian"
ARCHIVE_DOT = Path("wiki") / "archive" / "dot-graphify"
ARCHIVE_MARKER = ".ctx-archived.json"
RECONCILE_SIDECAR = ".ctx-reconcile.json"
STAT_INDEX = Path("cache") / "stat-index.json"
AST_CACHE = Path("cache") / "ast"
SEMANTIC_CACHE = Path("cache") / "semantic"
ANALYSIS_FILE = ".graphify_analysis.json"
SEMANTIC_MARKER = ".graphify_semantic_marker"
SNAPSHOT_GLOB = "20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]*"

# graph.json attribute names (verified, see module docstring).
SOURCE_ATTR = "source_file"
TYPE_ATTR = "file_type"
# Nodes that are never evicted even when their source_file is gone.
PROTECTED_TYPES = ("semantic", "rationale", "community")

REFRESH_DESCRIPTION = (
    "graphify-out/graph.json: GRAPHIFY_NO_BACKUP=1 graphify update <vault> --force --no-cluster "
    "-> evict nodes whose source_file is gone (keep rationale/semantic/community + pathless) "
    "-> graphify cluster-only <vault> --no-viz"
)

GRAPHIFY_TIMEOUT = int(os.environ.get("CTX_GRAPHIFY_TIMEOUT", "1800"))


# --------------------------------------------------------------------------- #
# Paths / small helpers
# --------------------------------------------------------------------------- #


def out_dir(ctx: Context) -> Path:
    return ctx.vault / OUT_DIR


def dot_dir(ctx: Context) -> Path:
    return ctx.vault / DOT_DIR


def graph_path(ctx: Context) -> Path:
    return out_dir(ctx) / "graph.json"


def evidence_roots(ctx: Context) -> List[Path]:
    return [out_dir(ctx), dot_dir(ctx), ctx.vault / ARCHIVE_OBSIDIAN, ctx.vault / ARCHIVE_DOT]


def graphify_bin() -> str:
    """The graphify CLI; hooks run with a minimal PATH so fall back to ~/.local/bin."""
    env = os.environ.get("CTX_GRAPHIFY_BIN")
    if env:
        return env
    found = shutil.which("graphify")
    if found:
        return found
    return str(Path.home() / ".local" / "bin" / "graphify")


def _newest_mtime(path: Path) -> float:
    try:
        newest = path.stat().st_mtime
    except OSError:
        return time.time()
    if path.is_dir():
        for p in core.iter_files(path):
            try:
                newest = max(newest, p.stat().st_mtime)
            except OSError:
                continue
    return newest


def _in_grace(ctx: Context, path: Path) -> bool:
    return _newest_mtime(path) >= ctx.grace_cutoff()


def _dir_is_empty(path: Path) -> bool:
    try:
        return path.is_dir() and not any(path.iterdir())
    except OSError:
        return False


def _unique_dest(ctx: Context, dest: Path) -> Path:
    """Never clobber a previous archive: suffix with the run timestamp when `dest` exists."""
    if not dest.exists():
        return dest
    return dest.with_name(dest.name + "-" + ctx.now.strftime("%Y%m%dT%H%M%SZ"))


def _under(path: Path, root: Path) -> bool:
    try:
        Path(path).resolve().relative_to(Path(root).resolve())
        return True
    except (ValueError, OSError):
        return False


# --------------------------------------------------------------------------- #
# graph.json inspection (read-only)
# --------------------------------------------------------------------------- #


def load_graph(path: Path) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def edge_key(graph: dict) -> str:
    """networkx >= 3.2 writes ``links``; the --no-cluster path and older versions write ``edges``."""
    return "links" if "links" in graph else "edges"


def source_exists(vault: Path, source: str) -> bool:
    p = Path(source)
    if not p.is_absolute():
        p = vault / p
    try:
        return p.exists()
    except OSError:
        return False


def is_protected(node: dict) -> bool:
    """Semantic/rationale/community nodes and nodes without a file path are never evicted."""
    if not node.get(SOURCE_ATTR):
        return True
    return str(node.get(TYPE_ATTR) or "") in PROTECTED_TYPES


def semantic_cache_ids(out: Path) -> Set[str]:
    """Node ids that cost LLM tokens (cache/semantic/*.json) — treated as semantic."""
    ids: Set[str] = set()
    d = out / SEMANTIC_CACHE
    if not d.is_dir():
        return ids
    for entry in d.glob("*.json"):
        try:
            data = json.loads(entry.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for n in data.get("nodes", []):
            if isinstance(n, dict) and n.get("id"):
                ids.add(str(n["id"]))
    return ids


def classify_nodes(graph: dict, vault: Path, extra_protected: Iterable[str] = ()) -> dict:
    """Split nodes into live / dead-source / protected (no mutation)."""
    protected_ids = set(extra_protected)
    live: List[dict] = []
    dead: List[dict] = []
    protected: List[dict] = []
    for n in graph.get("nodes", []):
        if is_protected(n) or str(n.get("id")) in protected_ids:
            protected.append(n)
        elif source_exists(vault, str(n[SOURCE_ATTR])):
            live.append(n)
        else:
            dead.append(n)
    return {"live": live, "dead": dead, "protected": protected}


def dead_source_count(graph: dict, vault: Path) -> int:
    """Nodes whose source_file is gone — counts protected ones too (the acceptance metric)."""
    return sum(
        1
        for n in graph.get("nodes", [])
        if n.get(SOURCE_ATTR) and not source_exists(vault, str(n[SOURCE_ATTR]))
    )


def degree_map(graph: dict) -> Dict[str, int]:
    """Distinct-neighbour degree per node id.

    `update --no-cluster` concatenates new AST edges with preserved ones without de-duplication
    (watch.py:412-413); cluster-only collapses them again via networkx. Counting distinct
    neighbours makes before/after comparisons immune to that transient multi-edge state.
    """
    nbrs: Dict[str, Set[str]] = {}
    for e in graph.get(edge_key(graph), []):
        s, t = e.get("source"), e.get("target")
        if s is None or t is None:
            continue
        nbrs.setdefault(str(s), set()).add(str(t))
        nbrs.setdefault(str(t), set()).add(str(s))
    return {k: len(v) for k, v in nbrs.items()}


def protected_ids_in(graph: dict, out: Path) -> Set[str]:
    """Ids the reconciliation must keep: typed rationale/semantic/community + semantic-cache ids."""
    ids = {str(n["id"]) for n in graph.get("nodes", []) if str(n.get(TYPE_ATTR) or "") in PROTECTED_TYPES}
    present = {str(n.get("id")) for n in graph.get("nodes", [])}
    ids |= {i for i in semantic_cache_ids(out) if i in present}
    return ids


# --------------------------------------------------------------------------- #
# plan
# --------------------------------------------------------------------------- #


def plan(ctx: Context) -> List[Action]:
    actions: List[Action] = []
    out = out_dir(ctx)
    vault = ctx.vault

    if not out.is_dir():
        actions.append(Action("note", LAYER, str(out), "no graphify-out/ in vault; nothing to prune"))
    else:
        # 1. dated snapshot dirs (export.backup_if_protected) — superseded copies.
        for snap in sorted(out.glob(SNAPSHOT_GLOB)):
            if not snap.is_dir():
                continue
            if _in_grace(ctx, snap):
                actions.append(Action("note", LAYER, str(snap), "snapshot inside grace window; skipped this run"))
                continue
            actions.append(
                Action(
                    "delete",
                    LAYER,
                    str(snap),
                    "dated backup snapshot superseded by live graphify-out/ (GRAPHIFY_NO_BACKUP policy)",
                    bytes=core.tree_size(snap),
                )
            )

        # 2. orphan obsidian export of the retired vault scripts/ingest-prompt.py.
        obs = out / "obsidian"
        if obs.is_dir():
            if _in_grace(ctx, obs):
                actions.append(Action("note", LAYER, str(obs), "obsidian export inside grace window; skipped"))
            else:
                actions.append(
                    Action(
                        "archive",
                        LAYER,
                        str(obs),
                        "orphan obsidian export (no producer since Jul 29); Obsidian indexes it",
                        dest=str(_unique_dest(ctx, vault / ARCHIVE_OBSIDIAN)),
                        bytes=core.tree_size(obs),
                    )
                )

        # 3. empty prompts/ placeholder (ingest-output.ensure_vault mkdir only).
        prompts = out / "prompts"
        if _dir_is_empty(prompts):
            actions.append(Action("delete", LAYER, str(prompts), "empty prompts/ placeholder; no producer"))

        # 4. orphan AST cache entries not referenced by cache/stat-index.json.
        for orphan, size in orphan_ast_entries(out):
            if _in_grace(ctx, orphan):
                continue
            actions.append(
                Action("delete", LAYER, str(orphan), "cache/ast entry not referenced by stat-index.json", bytes=size)
            )

        # 5. regenerate graph.json with deletion-aware reconciliation.
        actions.append(
            Action(
                "regenerate",
                LAYER,
                str(graph_path(ctx)),
                REFRESH_DESCRIPTION,
                bytes=core.file_size(graph_path(ctx)),
            )
        )

    # 6. legacy hook-written root (.graphify/) -> archive once.
    dot = dot_dir(ctx)
    if dot.is_dir():
        if _in_grace(ctx, dot):
            actions.append(Action("note", LAYER, str(dot), ".graphify/ written within grace window; skipped"))
        else:
            actions.append(
                Action(
                    "archive",
                    LAYER,
                    str(dot),
                    "legacy hook-written graphify root (graphify never reads .graphify/; producer removed)",
                    dest=str(_unique_dest(ctx, vault / ARCHIVE_DOT)),
                    bytes=core.tree_size(dot),
                )
            )

    for a in actions:
        core.assert_not_raw(a)
    return actions


def orphan_ast_entries(out: Path) -> List[Tuple[Path, int]]:
    """cache/ast/<hash>.json files whose hash no stat-index entry references."""
    ast = out / AST_CACHE
    if not ast.is_dir():
        return []
    referenced: Set[str] = set()
    idx = out / STAT_INDEX
    if idx.is_file():
        try:
            data = json.loads(idx.read_text(encoding="utf-8"))
            referenced = {str(v.get("hash")) for v in data.values() if isinstance(v, dict) and v.get("hash")}
        except (OSError, ValueError):
            # unreadable index: cannot prove anything is orphaned -> prune nothing
            return []
    else:
        return []
    orphans: List[Tuple[Path, int]] = []
    for entry in sorted(ast.glob("*.json")):
        if entry.stem not in referenced:
            orphans.append((entry, core.file_size(entry)))
    return orphans


# --------------------------------------------------------------------------- #
# apply
# --------------------------------------------------------------------------- #


def apply(action: Action, ctx: Context) -> Optional[dict]:
    """Idempotent; no-op when ctx.dry_run. Raises on failure (core's loop writes the ledger).

    Returns the reconciliation counts for `regenerate` so core can record them.
    """
    core.assert_not_raw(action)
    if action.layer != LAYER:
        raise ValueError("graphify.apply received action for layer %s" % action.layer)
    if ctx.dry_run or action.kind == "note":
        return None
    src = Path(action.path)
    if action.kind == "delete":
        _apply_delete(action, ctx, src)
        return None
    if action.kind == "archive":
        _apply_archive(action, ctx, src)
        return None
    if action.kind == "regenerate":
        return reconcile(ctx)
    raise ValueError("graphify layer does not handle action kind %r" % action.kind)


def _apply_delete(action: Action, ctx: Context, src: Path) -> None:
    out = out_dir(ctx)
    if not _under(src, out):
        raise PermissionError("refusing to delete outside graphify-out/: %s" % src)
    if not src.exists():
        return  # idempotent
    if src.is_dir() and not src.is_symlink():
        shutil.rmtree(src)
    else:
        src.unlink()
    ctx.log("deleted %s" % src)


def _apply_archive(action: Action, ctx: Context, src: Path) -> None:
    if not action.dest:
        raise ValueError("archive action without dest: %s" % src)
    dest = Path(action.dest)
    if not _under(dest, ctx.vault / "wiki" / "archive"):
        raise PermissionError("archive dest must live under wiki/archive/: %s" % dest)
    if not src.exists():
        return  # already moved (idempotent)
    if dest.exists():
        dest = _unique_dest(ctx, dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))
    marker = {
        "archived_at": ctx.now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "layer": LAYER,
        "from": str(src),
        "reason": action.reason,
        "bytes": action.bytes,
        "status": "archived",
    }
    core.atomic_write_text(dest / ARCHIVE_MARKER, json.dumps(marker, ensure_ascii=False, indent=2) + "\n")
    ctx.log("archived %s -> %s" % (src, dest))


# --------------------------------------------------------------------------- #
# reconciliation (the `regenerate` action)
# --------------------------------------------------------------------------- #


def _graphify_env() -> dict:
    env = {"GRAPHIFY_NO_BACKUP": "1", "GRAPHIFY_NO_TIPS": "1"}
    return env


def run_graphify(args: List[str], vault: Path, ctx: Optional[Context] = None) -> subprocess.CompletedProcess:
    """Run the graphify CLI with cwd=<vault>, no dated backups, no relocated output dir."""
    cmd = [graphify_bin()] + list(args)
    full_env = dict(os.environ)
    full_env.pop("GRAPHIFY_OUT", None)  # output must stay <vault>/graphify-out
    full_env.update(_graphify_env())

    try:
        cp = subprocess.run(
            cmd,
            cwd=str(vault),
            capture_output=True,
            text=True,
            timeout=GRAPHIFY_TIMEOUT,
            env=full_env,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("graphify CLI not found (%s): %s" % (cmd[0], exc))
    except subprocess.TimeoutExpired:
        raise RuntimeError("%s timed out after %ss" % (" ".join(cmd), GRAPHIFY_TIMEOUT))
    if ctx is not None:
        for line in (cp.stdout or "").splitlines():
            if line.strip():
                ctx.log("[graphify] " + line.strip())
    if cp.returncode != 0:
        tail = ((cp.stderr or "") + "\n" + (cp.stdout or "")).strip()[-800:]
        raise RuntimeError("%s failed (%s): %s" % (" ".join(cmd), cp.returncode, tail))
    return cp


def scan_manifest_paths(out: Path, fresh_after: Optional[float] = None) -> Optional[Set[Path]]:
    """Absolute paths graphify detected in its last scan (graphify-out/manifest.json keys).

    `save_manifest` (detect.py) writes abs-path -> {mtime, ast_hash, semantic_hash} after every
    update and prunes entries whose file vanished. Returns None when the manifest is missing,
    unreadable, or older than `fresh_after` (epoch) — callers must then skip the scan-set test.
    """
    mp = out / "manifest.json"
    try:
        if fresh_after is not None and mp.stat().st_mtime < fresh_after:
            return None
        data = json.loads(mp.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict) or not data:
        return None
    paths: Set[Path] = set()
    for k in data:
        try:
            paths.add(Path(k).resolve())
        except OSError:
            paths.add(Path(k))
    return paths


def _resolved_source(vault: Path, source: str) -> Path:
    p = Path(source)
    if not p.is_absolute():
        p = vault / p
    try:
        return p.resolve()
    except OSError:
        return p


def evict_dead_sources(
    graph: dict, vault: Path, out: Path, scanned: Optional[Set[Path]] = None
) -> Tuple[dict, dict]:
    """Return (new_graph, counts). Pure: does not touch disk.

    Evicts (1) nodes whose source_file no longer exists under <vault> and, when `scanned`
    (the fresh scan manifest) is given, (2) nodes whose source_file exists but was never part
    of graphify's own scan set (e.g. `.venv/…` zombies from before `.graphifyignore`, which
    watch.py's merge otherwise preserves forever). Protected ids are never evicted.
    """
    protected = protected_ids_in(graph, out)
    split = classify_nodes(graph, vault, extra_protected=protected)
    evicted_missing = {str(n["id"]) for n in split["dead"]}
    evicted_unscanned: Set[str] = set()
    live_nodes = split["live"]
    if scanned:
        still_live = []
        for n in live_nodes:
            if _resolved_source(vault, str(n[SOURCE_ATTR])) in scanned:
                still_live.append(n)
            else:
                evicted_unscanned.add(str(n["id"]))
        live_nodes = still_live
    evicted_ids = evicted_missing | evicted_unscanned
    kept_nodes = live_nodes + split["protected"]
    kept_ids = {str(n["id"]) for n in kept_nodes}
    ek = edge_key(graph)
    edges_before = graph.get(ek, [])
    kept_edges = [
        e for e in edges_before if str(e.get("source")) in kept_ids and str(e.get("target")) in kept_ids
    ]
    hyper_before = graph.get("hyperedges", []) or []
    kept_hyper = []
    for h in hyper_before:
        members = h.get("nodes") if isinstance(h, dict) else None
        if isinstance(members, list):
            if all(str(m) in kept_ids for m in members):
                kept_hyper.append(h)
        else:
            kept_hyper.append(h)
    new_graph = dict(graph)
    # keep the original node order (stable output) minus the evicted ones
    new_graph["nodes"] = [n for n in graph.get("nodes", []) if str(n["id"]) in kept_ids]
    new_graph[ek] = kept_edges
    if "hyperedges" in graph:
        new_graph["hyperedges"] = kept_hyper
    counts = {
        "nodes_before": len(graph.get("nodes", [])),
        "nodes_after": len(new_graph["nodes"]),
        "evicted": len(evicted_ids),
        "evicted_missing_source": len(evicted_missing),
        "evicted_unscanned_source": len(evicted_unscanned),
        "scan_manifest_used": scanned is not None,
        "edges_before": len(edges_before),
        "edges_after": len(kept_edges),
        "protected_preserved": len(split["protected"]),
        "semantic_ids": sorted(protected),
        "evicted_ids": sorted(evicted_ids),
        "source_attr": SOURCE_ATTR,
        "type_attr": TYPE_ATTR,
    }
    return new_graph, counts


def reconcile(ctx: Context, *, cluster: bool = True) -> dict:
    """Deletion-aware regeneration of <vault>/graphify-out/graph.json.

    (a) GRAPHIFY_NO_BACKUP=1 graphify update <vault> --force --no-cluster   (cwd=<vault>)
    (b) evict every node whose `source_file` no longer exists under <vault> (and, when this
        run's manifest.json is fresh, nodes whose source exists but is outside graphify's own
        scan set), except rationale/semantic/community nodes, semantic-cache nodes and nodes
        without a path; drop edges/hyperedges touching evicted nodes; write temp + atomic rename
    (c) graphify cluster-only <vault> --no-viz
    """
    vault = ctx.vault
    out = out_dir(ctx)
    gp = graph_path(ctx)
    pre_nodes = None
    pre_protected: Set[str] = set()
    if gp.is_file():
        try:
            before_graph = load_graph(gp)
            pre_nodes = len(before_graph.get("nodes", []))
            pre_protected = protected_ids_in(before_graph, out)
        except (OSError, ValueError):
            pre_nodes = None
    t0 = time.time()
    run_graphify(["update", str(vault), "--force", "--no-cluster"], vault, ctx)
    t_update = time.time() - t0

    graph = load_graph(gp)
    scanned = scan_manifest_paths(out, fresh_after=t0 - 1)
    new_graph, counts = evict_dead_sources(graph, vault, out, scanned)
    core.atomic_write_text(gp, json.dumps(new_graph, indent=2, ensure_ascii=False) + "\n")

    t1 = time.time()
    if cluster:
        run_graphify(["cluster-only", str(vault), "--no-viz"], vault, ctx)
    t_cluster = time.time() - t1

    final = load_graph(gp)
    final_ids = {str(n.get("id")) for n in final.get("nodes", [])}
    final_deg = degree_map(final)
    counts.update(
        {
            "nodes_pre_update": pre_nodes,
            "nodes_final": len(final.get("nodes", [])),
            "edges_final": len(final.get(edge_key(final), [])),
            "dead_source_nodes_final": dead_source_count(final, vault),
            "dead_source_unprotected_final": len(classify_nodes(final, vault, protected_ids_in(final, out))["dead"]),
            "pre_protected_missing": sorted(i for i in pre_protected if i not in final_ids),
            # what the reconciliation guarantees going forward: these ids exist with >= these degrees
            "semantic_degrees": {i: final_deg.get(i, 0) for i in counts["semantic_ids"] if i in final_ids},
            "update_seconds": round(t_update, 2),
            "cluster_seconds": round(t_cluster, 2),
            "ts": core.now_iso(),
            "graphify_bin": graphify_bin(),
        }
    )
    # Sidecar so `ctx test graphify-reconciled` can verify the preserved semantic ids later.
    core.atomic_write_text(out / RECONCILE_SIDECAR, json.dumps(counts, ensure_ascii=False, indent=2) + "\n")
    ctx.log(
        "graphify reconciled: %s -> %s nodes (evicted %s dead-source, preserved %s semantic/rationale), %s edges"
        % (counts["nodes_before"], counts["nodes_final"], counts["evicted"], counts["protected_preserved"], counts["edges_final"])
    )
    return {k: v for k, v in counts.items() if k not in ("evicted_ids",)}


# --------------------------------------------------------------------------- #
# refresh / status (read-only)
# --------------------------------------------------------------------------- #


def _newest_md_mtime(vault: Path) -> float:
    newest = 0.0
    for p in core.iter_files(vault, exclude=(OUT_DIR, DOT_DIR, ".obsidian", ".venv", "node_modules", ".git")):
        if p.suffix.lower() != ".md":
            continue
        try:
            newest = max(newest, p.stat().st_mtime)
        except OSError:
            continue
    return newest


def staleness(ctx: Context) -> dict:
    gp = graph_path(ctx)
    graph_mtime = gp.stat().st_mtime if gp.is_file() else None
    newest_md = _newest_md_mtime(ctx.vault)
    stale = graph_mtime is None or (newest_md > 0 and newest_md > graph_mtime)
    return {
        "graph_json": str(gp),
        "graph_mtime": core.iso(graph_mtime) if graph_mtime else None,
        "newest_md_mtime": core.iso(newest_md) if newest_md else None,
        "stale": bool(stale),
        "behind_seconds": int(newest_md - graph_mtime) if (graph_mtime and newest_md and newest_md > graph_mtime) else 0,
    }


def refresh(ctx: Context) -> dict:
    """No-op by design: the heavy regeneration only runs at checkpoint. Reports staleness."""
    info = staleness(ctx)
    info["action"] = "none (regenerated at checkpoint)"
    return info


def status(ctx: Context) -> dict:
    out = out_dir(ctx)
    gp = graph_path(ctx)
    snapshots = sorted(p.name for p in out.glob(SNAPSHOT_GLOB) if p.is_dir()) if out.is_dir() else []
    info: dict = {
        "layer": LAYER,
        "root": str(out),
        "exists": out.is_dir(),
        "bytes_total": core.tree_size(out) if out.is_dir() else 0,
        "graph_json_bytes": core.file_size(gp),
        "snapshot_dirs": snapshots,
        "snapshot_count": len(snapshots),
        "snapshot_bytes": sum(core.tree_size(out / s) for s in snapshots),
        "obsidian_export_bytes": core.tree_size(out / "obsidian") if (out / "obsidian").is_dir() else 0,
        "prompts_dir": "absent" if not (out / "prompts").exists() else ("empty" if _dir_is_empty(out / "prompts") else "non-empty"),
        "cache_ast_entries": len(list((out / AST_CACHE).glob("*.json"))) if (out / AST_CACHE).is_dir() else 0,
        "cache_ast_orphans": len(orphan_ast_entries(out)) if out.is_dir() else 0,
        "cache_semantic_entries": len(list((out / SEMANTIC_CACHE).glob("*.json"))) if (out / SEMANTIC_CACHE).is_dir() else 0,
        "dot_graphify_bytes": core.tree_size(dot_dir(ctx)) if dot_dir(ctx).is_dir() else 0,
        "dot_graphify_exists": dot_dir(ctx).is_dir(),
        "source_attr": SOURCE_ATTR,
        "type_attr": TYPE_ATTR,
    }
    info.update(staleness(ctx))
    if gp.is_file():
        try:
            graph = load_graph(gp)
        except (OSError, ValueError) as exc:
            info["graph_error"] = str(exc)
            return info
        protected = protected_ids_in(graph, out)
        split = classify_nodes(graph, ctx.vault, extra_protected=protected)
        scanned = scan_manifest_paths(out)
        unscanned = (
            sum(1 for n in split["live"] if _resolved_source(ctx.vault, str(n[SOURCE_ATTR])) not in scanned)
            if scanned
            else None
        )
        nodes = graph.get("nodes", [])
        info.update(
            {
                "nodes": len(nodes),
                "edges": len(graph.get(edge_key(graph), [])),
                "dead_source_nodes": dead_source_count(graph, ctx.vault),
                "dead_source_unprotected_nodes": len(split["dead"]),
                "live_source_nodes": len(split["live"]),
                "unscanned_source_nodes": unscanned,
                "protected_nodes": len(split["protected"]),
                "semantic_ids": sorted(protected),
                "file_types": _count_by(nodes, TYPE_ATTR),
            }
        )
    side = out / RECONCILE_SIDECAR
    if side.is_file():
        try:
            last = json.loads(side.read_text(encoding="utf-8"))
            info["last_reconcile"] = {k: last.get(k) for k in ("ts", "nodes_before", "nodes_final", "evicted", "protected_preserved")}
        except (OSError, ValueError):
            pass
    return info


def _count_by(items: Iterable[dict], key: str) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for it in items:
        k = str(it.get(key))
        counts[k] = counts.get(k, 0) + 1
    return counts
