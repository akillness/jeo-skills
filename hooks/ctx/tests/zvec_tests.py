"""`ctx test zvec-reconciled [--fixture]`: scratch repo under /tmp, direct-mode zg index,
edit + delete, real `ctx checkpoint --scope zvec` against the scratch, then assert the
index is reconciled (0 deleted resident, ready) and a search finds the edited token.

Hermetic: ZVEC_GREP_MODE=direct (no daemon, no registration of the scratch root),
CTX_ZVEC_REPO_ONLY=1 (no daemon-log rotation / sibling scan), scratch vault for the ledger,
`zg index --drop --yes` + rmtree at the end. Never touches the real repo or vault.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HOOKS = Path.home() / ".agents" / "hooks"
ZG = Path.home() / ".local" / "bin" / "zg"
EMBEDDING = os.environ.get("ZVEC_GREP_EMBEDDING") or "local/potion-code-16m-v2"
TOKEN = "zebra_token_ctx_reconcile"


def _run(cmd, cwd, env, timeout=600):
    cp = subprocess.run([str(c) for c in cmd], cwd=str(cwd), env=env, capture_output=True, text=True, timeout=timeout)
    return cp.returncode, (cp.stdout or "") + (cp.stderr or "")


def zvec_reconciled(args) -> int:
    if not ZG.exists():
        print("FAIL: zg not installed at %s" % ZG)
        return 1
    sys.path.insert(0, str(HOOKS))
    from ctx.layers.zvec import parse_status

    env = dict(os.environ)
    env["PYTHONPATH"] = str(HOOKS)
    env["ZVEC_GREP_MODE"] = "direct"
    env["CTX_ZVEC_REPO_ONLY"] = "1"
    env.pop("CTX_DRY_RUN", None)  # this test must run the real apply path on the scratch
    env["NO_COLOR"] = "1"

    base = Path(tempfile.mkdtemp(prefix="ctx-zvec-"))
    repo = base / "repo"
    vault = base / "vault"
    repo.mkdir()
    (vault / "wiki").mkdir(parents=True)
    failures = []
    try:
        _run(["git", "init", "-q", "."], repo, env)
        (repo / "a.py").write_text("def alpha_one():\n    return 1\n", encoding="utf-8")
        (repo / "b.js").write_text("function betaTwo() { return 2; }\n", encoding="utf-8")
        (repo / "c.md").write_text("# Gamma\n\nnotes about gamma_three\n", encoding="utf-8")
        _run(["git", "add", "-A"], repo, env)
        _run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], repo, env)

        rc, out = _run([ZG, "index", repo, "--embedding", EMBEDDING], repo, env)
        if rc != 0:
            failures.append("initial zg index failed rc=%s: %s" % (rc, out[-300:]))
            raise SystemExit
        rc, out = _run([ZG, "status", repo, "--check-ready"], repo, env)
        st0 = parse_status(out, rc)
        if not st0["ready"]:
            failures.append("fixture index not ready after initial index: %s" % st0)

        # mutate: edit one file (new token), delete one
        (repo / "a.py").write_text("def alpha_one():\n    return 1\n\ndef %s():\n    return 42\n" % TOKEN, encoding="utf-8")
        (repo / "b.js").unlink()
        rc, out = _run([ZG, "status", repo, "--check-ready"], repo, env)
        st1 = parse_status(out, rc)
        if st1["ready"] or st1["changes"]["deleted"] != 1:
            failures.append("expected stale with 1 deleted before checkpoint, got %s" % st1)

        # real checkpoint on the scratch (dry-run inventory is auto-recorded first by the core)
        rc, out = _run([sys.executable, "-m", "ctx", "checkpoint", "--scope", "zvec", "--repo", repo, "--vault", vault], repo, env, timeout=900)
        if rc != 0 or "REGENERATE zvec" not in out or "applied 1, failed 0" not in out:
            failures.append("ctx checkpoint --scope zvec rc=%s output:\n%s" % (rc, out[-1200:]))

        # assert reconciled
        rc, out = _run([ZG, "status", repo, "--check-ready"], repo, env)
        st2 = parse_status(out, rc)
        if not (st2["ready"] and st2["state"] == "ready" and st2["changes"]["deleted"] == 0):
            failures.append("index not reconciled after checkpoint: %s" % st2)

        rc, out = _run([ZG, "query", TOKEN, "--refresh", "off", "--mode", "direct", "--limit", "3"], repo, env)
        if rc != 0 or "a.py" not in out:
            failures.append("zg query for %s did not return a.py (rc=%s): %s" % (TOKEN, rc, out[-400:]))
        if "b.js" in out:
            failures.append("deleted b.js still returned by search")

        ledger = vault / "wiki" / "ctx-ledger.jsonl"
        if not ledger.is_file() or "regenerate" not in ledger.read_text(encoding="utf-8"):
            failures.append("ledger missing regenerate records")
    except SystemExit:
        pass
    finally:
        try:
            _run([ZG, "index", repo, "--drop", "--yes"], repo, env, timeout=300)
        except Exception:
            pass
        shutil.rmtree(base, ignore_errors=True)

    for f in failures:
        print("FAIL: " + f)
    if failures:
        return 1
    print("OK")
    return 0


# --------------------------------------------------------------------------- #
# zvec-orphan-gc: sibling-index deletion must fail closed
# --------------------------------------------------------------------------- #


def _fake_index(d: Path, roots, updated_ms: int, lease: dict = None) -> None:
    """A synthetic `.zvec-grep` dir: manifest.json + a segment file (+ optional lease)."""
    (d / "index.zvec").mkdir(parents=True, exist_ok=True)
    (d / "index.zvec" / "seg").write_bytes(b"x" * 64)
    import json
    (d / "manifest.json").write_text(json.dumps({
        "manifestVersion": 1, "name": d.parent.name, "path": str(d),
        "rootPaths": [{"absolutePath": r, "recursive": True} for r in roots] if roots is not None else roots,
        "updatedTime": updated_ms, "embedding": {"provider": "local", "model": "potion-code-16m-v2"},
    }), encoding="utf-8")
    if lease is not None:
        (d / "locks").mkdir(exist_ok=True)
        (d / "locks" / "daemon.json").write_text(json.dumps(lease), encoding="utf-8")


def zvec_orphan_gc(args) -> int:
    """plan()/apply() for sibling `.zvec-grep` indexes:
      1. all roots gone, >30 d, no owner      -> DELETE planned and applied
      2. one of two roots still exists        -> no action; apply refuses
      3. roots gone but daemon lease is fresh -> no action; apply refuses
      4. manifest missing rootPaths           -> no action; apply refuses
    """
    import json
    import time as _time
    sys.path.insert(0, str(HOOKS))
    from ctx.core import Action, build_context
    import ctx.layers.zvec as Z

    base = Path(tempfile.mkdtemp(prefix="ctx-zvec-gc-"))
    failures = []
    try:
        vault = base / "vault"
        (vault / "wiki").mkdir(parents=True)
        gone_a, gone_b, alive = base / "gone-a", base / "gone-b", base / "alive"
        alive.mkdir()
        old_ms = int((_time.time() - 60 * 86400) * 1000)
        cases = {
            "orphan": (base / "p1" / ".zvec-grep", [str(gone_a)], None),
            "surviving-root": (base / "p2" / ".zvec-grep", [str(gone_b), str(alive)], None),
            "live-lease": (base / "p3" / ".zvec-grep", [str(gone_a)],
                           {"pid": 999999, "updatedAt": int(_time.time() * 1000)}),
            "no-roots": (base / "p4" / ".zvec-grep", None, None),
        }
        for _name, (d, roots, lease) in cases.items():
            _fake_index(d, roots, old_ms, lease)

        # confine the sibling scan to the fixture
        Z.SIBLING_ROOTS = (base,)
        ns = type("A", (), {})()
        ns.vault, ns.repo, ns.dry_run, ns.scope = str(vault), None, False, "zvec"
        ns.evidence = None
        ctx = build_context(ns)
        found = {Path(e["path"]).parent.name: e for e in Z.stale_sibling_roots(ctx)}
        for name, key, want in (("orphan", "p1", True), ("surviving-root", "p2", False),
                                ("live-lease", "p3", False), ("no-roots", "p4", False)):
            got = found.get(key, {}).get("stale")
            if got is not want:
                failures.append("%s: stale=%s, expected %s (%s)" % (name, got, want, found.get(key)))

        # apply must refuse the three unsafe ones even if handed a delete Action
        for name, key in (("surviving-root", "p2"), ("live-lease", "p3"), ("no-roots", "p4")):
            d = cases[name][0]
            try:
                Z.apply(Action("delete", "zvec", str(d), "forced"), ctx)
                failures.append("%s: apply deleted an unsafe index" % name)
            except RuntimeError:
                pass
            if not d.is_dir():
                failures.append("%s: index dir vanished" % name)
        # and must delete the real orphan
        d = cases["orphan"][0]
        res = Z.apply(Action("delete", "zvec", str(d), "orphan"), ctx)
        if d.exists() or not res or res.get("deleted") != str(d):
            failures.append("orphan: not deleted (%s)" % res)
    finally:
        shutil.rmtree(base, ignore_errors=True)

    for f in failures:
        print("FAIL: " + f)
    if failures:
        return 1
    print("zvec-orphan-gc: orphan deleted; surviving-root / live-lease / no-roots refused")
    print("OK")
    return 0
