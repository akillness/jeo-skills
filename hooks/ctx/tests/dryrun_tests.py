"""`ctx test dryrun-noop`: prove that `ctx checkpoint --scope all --dry-run` mutates
NOTHING, on an isolated fixture where every byte is accounted for.

Why a fixture and not the live repo/vault: the live scope is shared with other
agents (ingest hooks, the zvec daemon watcher, concurrent `git push` checkpoints),
so a live snapshot is nondeterministic. Here the fixture is hermetic:

  * scratch git repo with a real `.mex/graph.db` (mex-agent 0.8.3 rebuild) and a
    real `.zvec-grep/` index built in direct mode (no daemon, no registration);
  * scratch vault with raw/sources, authored + auto wiki pages, an archive unit,
    and a real `graphify-out/` produced by `graphify update`;
  * CTX_ZVEC_REPO_ONLY=1 so the zvec layer never touches the shared daemon log or
    sibling roots.

Assertion: sha256 of every file under the fixture (repo + vault, no exclusions)
is identical before and after the dry-run, the file set is identical, and the
dry-run output contains DRY-RUN lines for all four layers. No allowances.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from ctx.core import resolve_tool_bin

HOOKS = Path(__file__).resolve().parents[2]
ZG = resolve_tool_bin("zg", "CTX_ZG_BIN")
MEX = resolve_tool_bin("mex-agent", "CTX_MEX_BIN")
EMBEDDING = os.environ.get("ZVEC_GREP_EMBEDDING") or "local/potion-code-16m-v2"

def _run(cmd, cwd, env, timeout=900):
    cp = subprocess.run([str(c) for c in cmd], cwd=str(cwd), env=env,
                        capture_output=True, text=True, timeout=timeout)
    return cp.returncode, (cp.stdout or "") + (cp.stderr or "")


def _sha(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _snapshot(root: Path) -> dict:
    out = {}
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            p = Path(dirpath) / name
            if p.is_symlink():
                out[str(p)] = ("symlink", os.readlink(p))
            else:
                out[str(p)] = (p.stat().st_size, _sha(p))
    return out


def _build_fixture(base: Path, env: dict, failures: list) -> tuple:
    repo = base / "repo"
    vault = base / "vault"
    repo.mkdir()
    for d in ("raw/sources/prompts/2026/07/01", "wiki/sources", "wiki/queries",
              "wiki/concepts", "wiki/archive/wiki/reports", "Clippings", ".state"):
        (vault / d).mkdir(parents=True, exist_ok=True)

    # --- repo: real mex graph + real zvec index (direct mode) ---
    _run(["git", "init", "-q", "."], repo, env)
    (repo / "a.py").write_text("def alpha_one():\n    return 1\n", encoding="utf-8")
    (repo / "b.js").write_text("function betaTwo() { return 2; }\n", encoding="utf-8")
    (repo / "c.md").write_text("# Gamma\n\nnotes about gamma_three\n", encoding="utf-8")
    _run(["git", "add", "-A"], repo, env)
    _run(["git", "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "init"], repo, env)
    rc, out = _run([MEX, "graph", "rebuild", "--root", repo, "--json"], repo, env)
    if rc != 0 or not (repo / ".mex" / "graph.db").is_file():
        failures.append("mex rebuild failed rc=%s: %s" % (rc, out[-300:]))
    # leave a stale recovery file so the mex plan has a real DELETE candidate
    (repo / ".mex" / "graph.db.recovery-deadbeef").write_bytes(b"stale")
    old = 1_700_000_000
    os.utime(repo / ".mex" / "graph.db.recovery-deadbeef", (old, old))
    rc, out = _run([ZG, "index", repo, "--embedding", EMBEDDING], repo, env)
    if rc != 0:
        failures.append("zg index failed rc=%s: %s" % (rc, out[-300:]))
    (repo / "b.js").unlink()  # make the zvec plan produce a REGENERATE candidate

    # --- vault: raw + authored + auto + archive unit + real graphify-out ---
    raw = vault / "raw/sources/prompts/2026/07/01/0001-prompt.md"
    raw.write_text("# prompt\n\nraw capture\n", encoding="utf-8")
    (vault / "Clippings" / "clip.md").write_text("clipping\n", encoding="utf-8")
    # auto pages carry the same frontmatter the real ingest scripts write
    (vault / "wiki/sources/2026-07-01-0001-prompt.md").write_text(
        "---\ntype: source-summary\nraw_path: raw/sources/prompts/2026/07/01/MISSING.md\n---\n# summary\n", encoding="utf-8")
    (vault / "wiki/queries/old-stub.md").write_text(
        "---\nsection: queries\nraw_prompt: raw/sources/prompts/2026/07/01/0001-prompt.md\n---\n# old\n\n## Answer\n\n"
        "- [ ] Fill this after the answer becomes worth keeping\n", encoding="utf-8")
    (vault / "wiki/concepts/orphan-concept.md").write_text("# Orphan\n\nnobody links me\n", encoding="utf-8")
    (vault / "wiki/concepts/linked-concept.md").write_text("# Linked\n", encoding="utf-8")
    (vault / "index.md").write_text("# Index\n\n## Synthesis\n\n- [[linked-concept]]\n\n- [[missing-page]]\n", encoding="utf-8")
    (vault / "log.md").write_text("# Log\n", encoding="utf-8")
    arch = vault / "wiki/archive/wiki/reports/old-report.md"
    arch.write_text("---\nstatus: archived\narchived_at: 2026-01-01T00:00:00Z\narchived_from: wiki/reports/old-report.md\n---\n# old\n", encoding="utf-8")
    for p in (vault / "wiki/queries/old-stub.md", vault / "wiki/concepts/orphan-concept.md",
              vault / "wiki/sources/2026-07-01-0001-prompt.md", arch, raw):
        os.utime(p, (old, old))
    rc, out = _run(["graphify", "update", str(vault), "--force"], vault,
                   dict(env, GRAPHIFY_NO_BACKUP="1"))
    if rc != 0 or not (vault / "graphify-out" / "graph.json").is_file():
        failures.append("graphify update failed rc=%s: %s" % (rc, out[-300:]))
    # dated snapshot + orphan ast entry so the graphify plan has DELETE candidates
    snap = vault / "graphify-out" / "2026-01-01"
    snap.mkdir()
    (snap / "graph.json").write_text("{}", encoding="utf-8")
    (vault / "graphify-out" / "cache" / "ast").mkdir(parents=True, exist_ok=True)
    orphan = vault / "graphify-out" / "cache" / "ast" / ("0" * 64 + ".json")
    orphan.write_text("{}", encoding="utf-8")
    for p in (snap / "graph.json", snap, orphan):  # past the grace window so GC planning engages
        os.utime(p, (old, old))
    return repo, vault


def dryrun_noop(args) -> int:
    for tool, p in (("zg", ZG), ("mex-agent", MEX)):
        if not p.exists():
            print("FAIL: %s not installed at %s" % (tool, p))
            return 1
    if shutil.which("graphify") is None:
        print("FAIL: graphify not on PATH")
        return 1
    env = dict(os.environ)
    env["PYTHONPATH"] = str(HOOKS)
    env["ZVEC_GREP_MODE"] = "direct"
    env["CTX_ZVEC_REPO_ONLY"] = "1"
    env["NO_COLOR"] = "1"
    env.pop("CTX_DRY_RUN", None)

    base = Path(tempfile.mkdtemp(prefix="ctx-dryrun-noop-"))
    failures: list = []
    try:
        repo, vault = _build_fixture(base, env, failures)
        if failures:
            raise SystemExit
        before = _snapshot(base)
        rc, out = _run([sys.executable, "-m", "ctx", "checkpoint", "--scope", "all", "--dry-run",
                        "--repo", repo, "--vault", vault], repo, env)
        after = _snapshot(base)

        if rc != 0:
            failures.append("dry-run exited %s:\n%s" % (rc, out[-800:]))
        for layer in ("mex", "zvec", "vault", "graphify"):
            if ("DRY-RUN REFRESH %s" % layer) not in out:
                failures.append("no DRY-RUN REFRESH line for %s" % layer)
        for needle in ("DRY-RUN REGENERATE mex", "DRY-RUN REGENERATE zvec", "DRY-RUN DELETE vault",
                       "DRY-RUN DELETE graphify"):
            if needle not in out:
                failures.append("expected inventory line missing: %s" % needle)
        for path, sig in before.items():
            if path not in after:
                failures.append("DELETED/MOVED by dry-run: %s" % path)
            elif after[path] != sig:
                failures.append("MODIFIED by dry-run: %s" % path)
        for path in after.keys() - before.keys():
            if "ctx-ledger.jsonl" in path:
                continue  # the dry-run inventory record itself, by contract
            failures.append("CREATED by dry-run: %s" % path)
        print("dryrun-noop fixture: %d files hashed, %d DRY-RUN lines, rc=%s"
              % (len(before), out.count("DRY-RUN"), rc))
    except SystemExit:
        pass
    finally:
        try:
            _run([ZG, "index", base / "repo", "--drop", "--yes"], base, env, timeout=120)
        except Exception:
            pass
        shutil.rmtree(base, ignore_errors=True)

    for f in failures:
        print("FAIL: " + f)
    if failures:
        return 1
    print("OK")
    return 0
