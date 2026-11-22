"""`ctx test` cases for the vault layer.

Dispatcher (ctx/tests/__init__.py) maps:
  raw-immutable         -> raw_immutable(args)
  ingest-race           -> ingest_race(args)
  consolidation-resume  -> consolidation_resume(args)

args = argparse.Namespace(vault: Path|None, fixture: bool, compare_to: Path|None).
Each returns 0 and prints OK on pass, non-zero otherwise. Only `raw_immutable`
ever looks at a real vault, and only through read-only snapshots + a
`--dry-run` checkpoint; the other two build scratch copies under /tmp.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from ctx.core import CANONICAL_VAULT, Context, assert_not_raw
from ctx.layers import vault as V
import ctx.ledger as L

HOOKS = Path.home() / ".agents" / "hooks"
INGEST_PROMPT = HOOKS / "ingest-prompt.py"
SCRATCH_IGNORE = (".venv", "graphify-out", ".graphify", ".obsidian", ".jeo")


def _vault(args) -> Path:
    v = getattr(args, "vault", None)
    return Path(v).expanduser() if v else CANONICAL_VAULT


def _ctx(vault: Path, dry_run: bool = True) -> Context:
    return Context(vault=vault, repo=None, now=datetime.now(timezone.utc), dry_run=dry_run,
                   log=lambda m: sys.stderr.write(m + "\n"))


def _scratch_copy(src: Path, name: str) -> Path:
    dst = Path(tempfile.mkdtemp(prefix="ctx-%s-" % name)) / "vault"
    shutil.copytree(src, dst, symlinks=True, ignore=shutil.ignore_patterns(*SCRATCH_IGNORE))
    try:
        (dst / "wiki" / "ctx-ledger.jsonl").unlink()
    except OSError:
        pass
    return dst


def _ctx_cmd() -> List[str]:
    shim = Path.home() / ".local" / "bin" / "ctx"
    if shim.exists():
        return [str(shim)]
    return [sys.executable, "-m", "ctx"]


def _snapshot(vault: Path) -> dict:
    return V.raw_manifest(_ctx(vault))


def _diff(before: dict, after: dict) -> Dict[str, List[str]]:
    b = {e["path"]: e for e in before["entries"]}
    a = {e["path"]: e for e in after["entries"]}
    removed = sorted(p for p in b if p not in a)
    changed = sorted(p for p in b if p in a and (a[p]["sha256"] != b[p]["sha256"] or a[p]["size"] != b[p]["size"]))
    added = sorted(p for p in a if p not in b)
    return {"removed": removed, "changed": changed, "added": added}


# --------------------------------------------------------------------------- #
# raw-immutable
# --------------------------------------------------------------------------- #


def raw_immutable(args) -> int:
    """raw/sources (+ every wiki/archive/roots/*/raw/sources) must never lose or
    change a file. With --compare-to <manifest.json>: compare the live tree to
    that saved manifest. Without it: snapshot, run `ctx checkpoint --scope
    vault --dry-run`, snapshot again. Additions are tolerated (live ingest
    hooks keep capturing) and reported; removals/changes fail."""
    vault = _vault(args)
    compare_to = getattr(args, "compare_to", None)
    after = _snapshot(vault)
    if compare_to:
        before = json.loads(Path(compare_to).read_text(encoding="utf-8"))
        label = "saved manifest %s" % compare_to
    else:
        before = after
        env = dict(os.environ)
        env.setdefault("PYTHONPATH", str(HOOKS))
        cp = subprocess.run(_ctx_cmd() + ["checkpoint", "--scope", "vault", "--dry-run", "--vault", str(vault)],
                            capture_output=True, text=True, env=env, timeout=600)
        if cp.returncode != 0:
            print("FAIL: dry-run checkpoint exited %d\n%s%s" % (cp.returncode, cp.stdout[-2000:], cp.stderr[-2000:]))
            return 1
        if "DRY-RUN" not in cp.stdout + cp.stderr:
            print("FAIL: dry-run checkpoint printed no DRY-RUN lines")
            return 1
        after = _snapshot(vault)
        label = "dry-run checkpoint"
    d = _diff(before, after)
    print("raw-immutable: %s -> before %d files sha %s / after %d files sha %s" % (
        label, before["count"], before["sha256"][:12], after["count"], after["sha256"][:12]))
    if d["added"]:
        print("raw-immutable: %d file(s) added by live ingest (allowed): %s" % (len(d["added"]), d["added"][:3]))
    if d["removed"] or d["changed"]:
        print("FAIL: raw tree lost/changed files — removed %s changed %s" % (d["removed"][:5], d["changed"][:5]))
        return 1
    print("OK")
    return 0


# --------------------------------------------------------------------------- #
# ingest-race
# --------------------------------------------------------------------------- #


def _balanced_markers(text: str) -> bool:
    for marker in ("SOURCES", "QUERIES", "REPORTS", "ctx:auto"):
        s = text.count("<!-- %s:START -->" % marker)
        e = text.count("<!-- %s:END -->" % marker)
        if s != e or s > 1:
            return False
    return True


def _well_formed(text: str) -> bool:
    if not text.endswith("\n"):
        return False
    if "\x00" in text:
        return False
    return _balanced_markers(text)


def ingest_race(args) -> int:
    """Hold the vault lock for 8 s in a subprocess, run ingest-prompt.py against
    a scratch copy with a synthetic prompt; the raw capture must exist while
    the lock is held, and after release index.md must be well-formed and
    contain the capture (either written after the wait, or deferred)."""
    src = _vault(args)
    if not (src / "wiki").is_dir():
        print("FAIL: %s is not a vault" % src)
        return 1
    scratch = _scratch_copy(src, "ingest-race")
    V.ensure_auto_markers(_ctx(scratch, dry_run=False))
    index_before = (scratch / "index.md").read_text(encoding="utf-8")
    if not _well_formed(index_before):
        print("FAIL: scratch index.md not well-formed before the race")
        return 1
    env = dict(os.environ)
    env["LLM_WIKI_VAULT"] = str(scratch)
    env["PYTHONPATH"] = str(HOOKS)
    env["CTX_VAULT_LOCK_WAIT"] = "30"
    holder = subprocess.Popen([sys.executable, "-c",
                               "import sys; sys.path.insert(0, %r); from ctx.lock import hold; hold('vault', 8)" % str(HOOKS)],
                              stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    time.sleep(0.7)  # let the holder acquire
    payload = json.dumps({"session_id": "ctx-test", "prompt": "ctx race test", "hook_event_name": "UserPromptSubmit"})
    t0 = time.time()
    ingest = subprocess.Popen([sys.executable, str(INGEST_PROMPT)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, env=env, text=True)
    ingest.stdin.write(payload)
    ingest.stdin.close()
    raw_dir = scratch / "raw" / "sources" / "prompts"
    raw_hit: Optional[Path] = None
    deadline = time.time() + 5
    while time.time() < deadline and raw_hit is None:
        for p in raw_dir.rglob("*-ctx-test-ctx-race-test.md"):
            raw_hit = p
            break
        time.sleep(0.1)
    if raw_hit is None:
        ingest.wait(timeout=60)
        print("FAIL: raw capture not written while the lock was held (stderr: %s)" % ingest.stderr.read()[-500:])
        holder.wait(timeout=20)
        return 1
    print("ingest-race: raw capture landed after %.1fs while vault lock held: %s" % (time.time() - t0, raw_hit.name))
    ingest.wait(timeout=90)
    holder.wait(timeout=30)
    elapsed = time.time() - t0
    index_after = (scratch / "index.md").read_text(encoding="utf-8")
    log_after = (scratch / "log.md").read_text(encoding="utf-8")
    if not _well_formed(index_after):
        print("FAIL: index.md not well-formed after the race")
        return 1
    deferred = scratch / ".state" / "deferred-index.jsonl"
    captured = "ctx-race-test" in index_after and "ctx-race-test" in log_after
    if not captured and not deferred.exists():
        print("FAIL: capture neither in index.md/log.md nor recorded as deferred")
        return 1
    if ingest.returncode != 0:
        print("FAIL: ingest-prompt.py exited %d" % ingest.returncode)
        return 1
    print("ingest-race: ingest finished after %.1fs; index.md %s; markers balanced; exit 0" % (
        elapsed, "contains the capture" if captured else "update deferred (recorded in .state/deferred-index.jsonl)"))
    if elapsed < 6.0:
        print("ingest-race: WARNING ingest returned before the 8s hold ended — lock not contended? (%.1fs)" % elapsed)
    shutil.rmtree(scratch.parent, ignore_errors=True)
    print("OK")
    return 0


# --------------------------------------------------------------------------- #
# consolidation-resume
# --------------------------------------------------------------------------- #


def _old(p: Path, days: int = 90) -> None:
    ts = time.time() - days * 86400
    os.utime(p, (ts, ts))


def consolidation_resume(args) -> int:
    """Interrupted consolidation: `<dest>.moving/` holds MANIFEST.json + part of
    the files; the source root has been re-created with the rest plus a new
    file. apply() must resume (merge without overwriting), every raw file must
    survive in exactly one place, and the ledger must record the resume."""
    work = Path(tempfile.mkdtemp(prefix="ctx-consolidation-resume-"))
    vault = work / "vault"
    (vault / "wiki").mkdir(parents=True)
    (vault / "raw" / "sources").mkdir(parents=True)
    (vault / "index.md").write_text("# Index\n", encoding="utf-8")
    (vault / "log.md").write_text("# Log\n", encoding="utf-8")
    root = work / "foreign" / "llm-wiki"
    files = {
        "raw/sources/prompts/a.md": "# a\n",
        "raw/sources/prompts/b.md": "# b\n",
        "raw/sources/prompts/c.md": "# c\n",
        "wiki/queries/q.md": "# q\n",
        "index.md": "# I\n",
        "log.md": "# L\n",
        ".graphify/graph.json": "{}",
    }
    for rel, body in files.items():
        p = root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(body, encoding="utf-8")
    for p in list(root.rglob("*")) + [root]:
        _old(p)
    orig_roots, orig_scan = V.FIXED_LIVE_ROOTS, V.SKELETON_SCAN_ROOTS
    V.FIXED_LIVE_ROOTS, V.SKELETON_SCAN_ROOTS = (root,), ()
    try:
        ctx = _ctx(vault, dry_run=False)
        [(origin, slug)] = V.consolidation_roots(ctx)
        dest = V._dest_root(ctx, slug)
        tmp = V._moving_dir(dest)
        # simulate the interruption: manifest written, a+b already staged, c/wiki still at source
        manifest = {"origin": str(root), "dest": str(dest), "started_at": "2026-10-01T10:00:00Z",
                    "layer": "vault", "files": V._tree_manifest(root)}
        tmp.mkdir(parents=True)
        (tmp / "MANIFEST.json").write_text(json.dumps(manifest), encoding="utf-8")
        for rel in ("raw/sources/prompts/a.md", "raw/sources/prompts/b.md"):
            (tmp / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(root / rel), str(tmp / rel))
        # the ingest hook "re-creates" the source with a new capture
        (root / "raw/sources/prompts/d.md").write_text("# d\n", encoding="utf-8")
        for p in (root, root / "raw", root / "raw/sources", root / "raw/sources/prompts", root / "raw/sources/prompts/d.md"):
            _old(p)
        expected_raw = {"a.md", "b.md", "c.md", "d.md"}
        still_at_source = sum(1 for p in root.rglob("*") if p.is_file())  # c, q, index, log, .graphify, d

        plan = V.plan(ctx)
        archive = [a for a in plan if a.kind == "archive"]
        if len(archive) != 1 or "resume interrupted consolidation" not in archive[0].reason:
            print("FAIL: plan did not produce a single resume ARCHIVE action: %s" % [a.describe() for a in plan])
            return 1
        ph = L.record_plan(ctx, "vault", plan, False)
        for a in plan:
            if a.kind == "note":
                continue
            assert_not_raw(a)
            V.apply(a, ctx)
            L.record_action(ctx, a, ph, ok=True)

        raw_now = [p for p in vault.rglob("*.md") if "raw/sources" in p.as_posix()]
        names = sorted(p.name for p in raw_now)
        if names != sorted(expected_raw):
            print("FAIL: raw files after resume = %s (expected %s)" % (names, sorted(expected_raw)))
            return 1
        leftovers = [p for p in root.rglob("*") if p.is_file()] if root.exists() else []
        if leftovers or tmp.exists() or V._sidecar_manifest(dest).exists():
            print("FAIL: leftovers — source %s, tmp exists %s, sidecar exists %s" % (leftovers, tmp.exists(), V._sidecar_manifest(dest).exists()))
            return 1
        marker = json.loads((dest / V.MARKER_FILE).read_text(encoding="utf-8"))
        if not marker.get("resumed") or marker["resumed"].get("moved") != still_at_source:
            print("FAIL: marker does not record the resume: %s" % marker)
            return 1
        ledger = [json.loads(l) for l in (vault / "wiki" / "ctx-ledger.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
        recorded = [r for r in ledger if r.get("type") == "action" and "resume interrupted consolidation" in r.get("reason", "")]
        if not recorded or not recorded[0].get("ok"):
            print("FAIL: ledger has no ok resume record")
            return 1
        # second, unrecoverable case: a .moving dir with no manifest must only yield a NOTE and stay untouched
        bad = V._moving_dir(dest.with_name("orphan"))
        (bad / "raw" / "sources").mkdir(parents=True)
        (bad / "raw" / "sources" / "only-copy.md").write_text("# only\n", encoding="utf-8")
        V.FIXED_LIVE_ROOTS = ()
        plan2 = V.plan(ctx)
        notes = [a for a in plan2 if a.kind == "note" and a.path == str(bad)]
        touching = [a for a in plan2 if a.kind != "note" and str(bad) in (a.path, a.dest or "")]
        if not notes or touching:
            print("FAIL: unmanifested .moving dir not reported as note-only: notes=%d touching=%d" % (len(notes), len(touching)))
            return 1
        if not (bad / "raw" / "sources" / "only-copy.md").exists():
            print("FAIL: unmanifested staging dir was modified")
            return 1
        print("consolidation-resume: resumed %s (moved %d, deduped %d); raw a/b/c/d each exactly once; unmanifested .moving -> NOTE only" % (
            dest.name, marker["resumed"]["moved"], marker["resumed"]["deduped"]))
    finally:
        V.FIXED_LIVE_ROOTS, V.SKELETON_SCAN_ROOTS = orig_roots, orig_scan
    shutil.rmtree(work, ignore_errors=True)
    print("OK")
    return 0
