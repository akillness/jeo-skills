"""`ctx test graphify-reconciled [--vault P] [--fixture]`.

--vault P   : assert the reconciled state of <P>/graphify-out/ (read-only).
--fixture   : build a scratch vault under /tmp, run the real `graphify update` + the
              reconciliation there, delete a page, re-run, assert eviction. Never
              touches the real vault.
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from ctx import core
from ctx.core import Context
from ctx.layers import graphify as gl

FIXTURE_PAGES = {
    "alpha.md": "# Alpha\n\nAlpha links to [[beta]] and [[gamma]].\n\n## Alpha details\n\nSome prose about alpha.\n",
    "beta.md": "# Beta\n\nBeta links back to [[alpha]].\n\n## Beta details\n\nBeta prose with a [[gamma]] mention.\n",
    "gamma.md": "# Gamma\n\nGamma is terminal; it links to [[alpha]].\n\n## Gamma details\n\nMore prose.\n",
}


def _ctx(vault: Path, dry_run: bool = False) -> Context:
    return Context(
        vault=vault,
        repo=None,
        now=datetime.now(timezone.utc),
        dry_run=dry_run,
        grace_seconds=0,
        log=lambda m: sys.stdout.write("  | " + m + "\n"),
    )


def _fail(msg: str) -> int:
    print("FAIL: " + msg)
    return 1


# --------------------------------------------------------------------------- #
# --vault mode
# --------------------------------------------------------------------------- #


def check_vault(vault: Path) -> List[str]:
    """Return a list of problems (empty == reconciled)."""
    problems: List[str] = []
    out = vault / gl.OUT_DIR
    gp = gl.graph_path(_ctx(vault, dry_run=True))
    if not out.is_dir():
        return ["no %s" % out]
    if not gp.is_file():
        return ["no %s" % gp]

    snaps = [p.name for p in out.glob(gl.SNAPSHOT_GLOB) if p.is_dir()]
    if snaps:
        problems.append("dated snapshot dirs still present: %s" % ", ".join(sorted(snaps)))

    graph = gl.load_graph(gp)
    dead = [n for n in graph.get("nodes", []) if n.get(gl.SOURCE_ATTR) and not gl.source_exists(vault, str(n[gl.SOURCE_ATTR]))]
    dead_unprotected = [n for n in dead if not gl.is_protected(n)]
    if dead_unprotected:
        sample = ", ".join(str(n.get("id")) for n in dead_unprotected[:5])
        problems.append("%d nodes reference missing source files (e.g. %s)" % (len(dead_unprotected), sample))

    present = {str(n.get("id")): n for n in graph.get("nodes", [])}
    deg = gl.degree_map(graph)

    # Semantic/rationale ids that must survive: typed nodes in the live graph,
    # semantic-cache ids, and whatever the last reconciliation promised to keep.
    required = set(gl.protected_ids_in(graph, out))
    pre_degree = {}
    side = out / gl.RECONCILE_SIDECAR
    if side.is_file():
        try:
            last = json.loads(side.read_text(encoding="utf-8"))
            required |= set(last.get("semantic_ids", []))
            pre_degree = dict(last.get("semantic_degrees", {}))
        except (OSError, ValueError) as exc:
            problems.append("unreadable %s: %s" % (side, exc))
    analysis = out / gl.ANALYSIS_FILE
    analysis_ids = set()
    if analysis.is_file():
        try:
            data = json.loads(analysis.read_text(encoding="utf-8"))
            comms = data.get("communities", {})
            members = comms.values() if isinstance(comms, dict) else comms
            for m in members:
                if isinstance(m, list):
                    analysis_ids.update(str(i) for i in m)
        except (OSError, ValueError) as exc:
            problems.append("unreadable %s: %s" % (analysis, exc))
    recorded = {i for i in required if i in analysis_ids} if analysis_ids else set()

    for nid in sorted(required):
        node = present.get(nid)
        if node is None:
            problems.append("semantic/rationale node %r vanished from graph.json" % nid)
            continue
        d = deg.get(nid, 0)
        typed = str(node.get(gl.TYPE_ATTR) or "") in gl.PROTECTED_TYPES
        if typed and d < 1:
            problems.append("%s node %r has no edges" % (node.get(gl.TYPE_ATTR), nid))
        elif nid in pre_degree and d < int(pre_degree[nid]):
            problems.append("node %r lost edges (%s -> %s)" % (nid, pre_degree[nid], d))
    print(
        "graphify-reconciled %s: nodes=%d edges=%d snapshots=%d dead_source=%d semantic_required=%d (%d also recorded in %s)"
        % (
            vault,
            len(present),
            len(graph.get(gl.edge_key(graph), [])),
            len(snaps),
            len(dead_unprotected),
            len(required),
            len(recorded),
            gl.ANALYSIS_FILE,
        )
    )
    return problems


# --------------------------------------------------------------------------- #
# --fixture mode
# --------------------------------------------------------------------------- #


def _nodes_for(graph: dict, source: str) -> List[dict]:
    return [n for n in graph.get("nodes", []) if str(n.get(gl.SOURCE_ATTR)) == source]


def _apply_all(ctx: Context) -> List[str]:
    done: List[str] = []
    for a in gl.plan(ctx):
        if a.kind == "note":
            continue
        gl.apply(a, ctx)
        done.append(a.kind + " " + os.path.relpath(a.path, ctx.vault))
    return done


def run_fixture() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="ctx-graphify-fixture-"))
    vault = tmp / "vault"
    (vault / "wiki").mkdir(parents=True)
    for name, body in FIXTURE_PAGES.items():
        (vault / name).write_text(body, encoding="utf-8")
    print("fixture vault: %s" % vault)
    try:
        ctx = _ctx(vault)
        out = vault / gl.OUT_DIR

        # Run 1: fresh build via the real CLI + reconcile (nothing to evict yet).
        counts1 = gl.reconcile(ctx)
        g1 = gl.load_graph(gl.graph_path(ctx))
        for name in FIXTURE_PAGES:
            if not _nodes_for(g1, name):
                return _fail("run 1: no node for %s (graphify update did not index it)" % name)
        if counts1["evicted"] != 0:
            return _fail("run 1 evicted %s nodes from a fresh graph" % counts1["evicted"])
        if gl.dead_source_count(g1, vault) != 0:
            return _fail("run 1 left dead-source nodes")
        print("run 1: %d nodes, %d edges, evicted %d" % (counts1["nodes_final"], counts1["edges_final"], counts1["evicted"]))

        # Simulate the real vault's history: a semantic marker (so graphify *would* snapshot),
        # a stale dated snapshot, an orphan AST cache entry, and a rationale node whose
        # source is about to disappear (must be preserved with its edge).
        (out / gl.SEMANTIC_MARKER).write_text('{"output_tokens": 1}\n', encoding="utf-8")
        snap = out / "2026-01-01"
        snap.mkdir()
        (snap / "graph.json").write_text("{}", encoding="utf-8")
        (out / gl.AST_CACHE).mkdir(parents=True, exist_ok=True)
        orphan = out / gl.AST_CACHE / ("0" * 64 + ".json")
        orphan.write_text("{}", encoding="utf-8")
        alpha_id = str(_nodes_for(g1, "alpha.md")[0]["id"])
        g1["nodes"].append(
            {"id": "fixture_rationale_1", "label": "why beta existed", gl.TYPE_ATTR: "rationale", gl.SOURCE_ATTR: "beta.md", "community": 0}
        )
        g1[gl.edge_key(g1)].append(
            {"source": "fixture_rationale_1", "target": alpha_id, "relation": "rationale_for", "confidence": "EXTRACTED", gl.SOURCE_ATTR: "beta.md"}
        )
        # A zombie: its file exists but lives in a dir graphify never scans (.graphifyignore),
        # so watch.py's merge would preserve it forever. Must be evicted via the scan manifest.
        (vault / ".graphifyignore").write_text("vendor/\n", encoding="utf-8")
        (vault / "vendor").mkdir()
        (vault / "vendor" / "zombie.md").write_text("# Zombie\n\nignored dir\n", encoding="utf-8")
        g1["nodes"].append(
            {"id": "fixture_zombie_1", "label": "Zombie", gl.TYPE_ATTR: "document", gl.SOURCE_ATTR: "vendor/zombie.md", "community": 0}
        )
        core.atomic_write_text(gl.graph_path(ctx), json.dumps(g1, indent=2, ensure_ascii=False) + "\n")

        # Delete a page, then run the full plan/apply cycle (= checkpoint for this layer).
        (vault / "beta.md").unlink()
        ctx = _ctx(vault)  # fresh `now`: the fixture files above must be outside the (0 s) grace window
        done = _apply_all(ctx)
        print("run 2 applied: " + "; ".join(done))

        g2 = gl.load_graph(gl.graph_path(ctx))
        side = json.loads((out / gl.RECONCILE_SIDECAR).read_text(encoding="utf-8"))
        if _nodes_for(g2, "beta.md") and any(not gl.is_protected(n) for n in _nodes_for(g2, "beta.md")):
            return _fail("beta.md nodes survived eviction: %s" % [n["id"] for n in _nodes_for(g2, "beta.md")])
        for name in ("alpha.md", "gamma.md"):
            if not _nodes_for(g2, name):
                return _fail("%s nodes were lost by the reconciliation" % name)
        present = {str(n["id"]): n for n in g2["nodes"]}
        if "fixture_rationale_1" not in present:
            return _fail("rationale node with a deleted source was evicted")
        if gl.degree_map(g2).get("fixture_rationale_1", 0) < 1:
            return _fail("rationale node lost its edge")
        if "fixture_zombie_1" in present:
            return _fail("node for an ignored-dir file (vendor/zombie.md) survived; scan-manifest eviction failed")
        if side["evicted_missing_source"] < 1 or side["evicted_unscanned_source"] != 1 or not side["scan_manifest_used"]:
            return _fail("unexpected eviction split: %s" % {k: side[k] for k in ("evicted", "evicted_missing_source", "evicted_unscanned_source", "scan_manifest_used")})
        if gl.dead_source_count(g2, vault) != 1:  # exactly the protected rationale node
            return _fail("unexpected dead-source count %d" % gl.dead_source_count(g2, vault))
        if snap.exists():
            return _fail("dated snapshot dir was not deleted")
        if orphan.exists():
            return _fail("orphan cache/ast entry was not deleted")
        if [p for p in out.glob(gl.SNAPSHOT_GLOB) if p.is_dir()]:
            return _fail("graphify created a new dated snapshot despite GRAPHIFY_NO_BACKUP=1")
        if not (out / gl.SEMANTIC_MARKER).is_file():
            return _fail("semantic marker was removed")
        if not (out / "GRAPH_REPORT.md").is_file():
            return _fail("cluster-only did not write GRAPH_REPORT.md")
        if any(n.get("community") is None for n in g2["nodes"]):
            return _fail("cluster-only left nodes without a community")
        print(
            "run 2: %d -> %d nodes (evicted %d: %s), rationale preserved with %d edge(s)"
            % (side["nodes_before"], side["nodes_final"], side["evicted"], ", ".join(side.get("evicted_ids", [])), gl.degree_map(g2)["fixture_rationale_1"])
        )

        # The --vault assertions must hold on the fixture too (modulo the protected dead node).
        problems = check_vault(vault)
        if problems:
            return _fail("post-run vault check: " + "; ".join(problems))

        # Dry-run must plan nothing destructive now and touch nothing.
        before = core.manifest(out)
        dry = gl.plan(_ctx(vault, dry_run=True))
        for a in dry:
            if a.kind in core.GC_KINDS:
                return _fail("second plan still wants to %s %s" % (a.kind, a.path))
            gl.apply(a, _ctx(vault, dry_run=True))
        if core.manifest(out)["sha256"] != before["sha256"]:
            return _fail("dry-run apply mutated graphify-out/")
        print("OK")
        return 0
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# --------------------------------------------------------------------------- #
# entry point used by ctx/tests/__init__.py
# --------------------------------------------------------------------------- #


def graphify_reconciled(args) -> int:
    if getattr(args, "fixture", False):
        return run_fixture()
    vault = Path(getattr(args, "vault", None) or os.environ.get("CTX_VAULT") or core.CANONICAL_VAULT).expanduser()
    problems = check_vault(vault)
    if problems:
        for p in problems:
            print("FAIL: " + p)
        return 1
    print("OK")
    return 0


if __name__ == "__main__":  # python3 -m ctx.tests.graphify_tests [--fixture] [--vault P]
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--vault")
    ap.add_argument("--fixture", action="store_true")
    ap.add_argument("--compare-to", dest="compare_to")
    sys.exit(graphify_reconciled(ap.parse_args()))
