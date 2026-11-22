"""`ctx test core-selftest`: lock skip, ledger dry-run gating, raw exemption, CTX_DRY_RUN.

Runs entirely in a temp dir; never touches the real vault or repo.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

from ctx import ledger
from ctx.core import Action, Context, assert_not_raw, is_raw_exempt
from ctx.lock import Locked, layer_lock

SHIM = Path.home() / ".local" / "bin" / "ctx"


def _ctx(tmp: Path, dry_run: bool) -> Context:
    return Context(vault=tmp / "vault", repo=None, now=datetime.now(timezone.utc), dry_run=dry_run, log=lambda m: None)


def core_selftest(args) -> int:
    failures = []
    tmp = Path(tempfile.mkdtemp(prefix="ctx-selftest-"))
    env = dict(os.environ)
    env["PYTHONPATH"] = str(Path.home() / ".agents" / "hooks")
    env.pop("CTX_DRY_RUN", None)

    # 1. raw exemption
    for p, exp in (
        ("/v/raw/sources/prompts/x.md", True),
        ("/v/wiki/archive/roots/s/raw/sources/x.md", True),
        ("/v/Clippings/a.md", True),
        ("/v/wiki/queries/a.md", False),
        ("/v/rawsources/a.md", False),
    ):
        if is_raw_exempt(p) != exp:
            failures.append("is_raw_exempt(%s) != %s" % (p, exp))
    try:
        assert_not_raw(Action("delete", "vault", "/v/raw/sources/x.md", "t"))
        failures.append("assert_not_raw did not raise")
    except PermissionError:
        pass

    # 2. ledger gating
    c = _ctx(tmp, dry_run=True)
    acts = [Action("delete", "mex", str(tmp / "a"), "r"), Action("note", "mex", str(tmp / "b"), "n")]
    ph = ledger.record_plan(c, "mex", acts, dry_run=True)
    if not ledger.has_dry_run(c, ph):
        failures.append("has_dry_run false after record_plan(dry_run=True)")
    ph2 = ledger.plan_hash([Action("delete", "mex", str(tmp / "a"), "other reason", bytes=99)], "mex")
    if ph2 != ledger.plan_hash([a for a in acts if a.kind == "delete"], "mex"):
        failures.append("plan_hash should ignore reason/bytes")
    if ledger.has_dry_run(c, "deadbeefdeadbeef"):
        failures.append("has_dry_run true for unknown hash")
    lines = (tmp / "vault" / "wiki" / "ctx-ledger.jsonl").read_text().splitlines()
    if len(lines) != 1 or json.loads(lines[0]).get("type") != "plan":
        failures.append("ledger line not written as expected")

    # 3. lock skip across processes
    holder = subprocess.Popen(
        [sys.executable, "-c", "import sys;sys.path.insert(0,%r);from ctx.lock import hold;hold('mex',4)" % str(Path.home() / ".agents" / "hooks")],
        env=env,
    )
    try:
        time.sleep(0.8)
        try:
            with layer_lock("mex"):
                failures.append("lock acquired while another process holds it")
        except Locked:
            pass
        with layer_lock("zvec"):
            pass  # unrelated layer stays free
    finally:
        holder.wait(timeout=10)
    with layer_lock("mex"):
        pass  # released after holder exits

    # 4. CTX_DRY_RUN forces dry-run through the shim (gc on a scope with no repo/vault content)
    if SHIM.exists():
        env2 = dict(env)
        env2["CTX_DRY_RUN"] = "1"
        cp = subprocess.run(
            [str(SHIM), "gc", "--scope", "mex", "--vault", str(tmp / "vault"), "--repo", str(tmp)],
            capture_output=True,
            text=True,
            env=env2,
            timeout=120,
        )
        if cp.returncode != 0 or "dry-run forced by CTX_DRY_RUN" not in cp.stderr or "DRY-RUN" not in cp.stdout:
            failures.append("CTX_DRY_RUN not honoured (rc=%s stdout=%r stderr=%r)" % (cp.returncode, cp.stdout[-200:], cp.stderr[-200:]))
        cp = subprocess.run([str(SHIM), "gc"], capture_output=True, text=True, env=env, timeout=60)
        if cp.returncode != 2:
            failures.append("ctx gc without --scope should exit 2, got %s" % cp.returncode)

    for f in failures:
        print("FAIL: " + f)
    if failures:
        return 1
    print("OK")
    return 0
