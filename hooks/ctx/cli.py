"""`ctx` command line.

    ctx refresh    --scope S [--repo P] [--vault P]
    ctx checkpoint --scope S [--dry-run] [--evidence PATH] [--repo P] [--vault P]
    ctx gc         --scope S [--dry-run] [--repo P] [--vault P]
    ctx status     [--check-wiring] [--json] [--repo P] [--vault P]
    ctx lock hold LAYER --for N
    ctx test NAME [--vault P] [--fixture] [--compare-to P]
    ctx install shim | pre-push [--repo P]

Exit codes: 0 ok (including skipped-because-locked), 1 a layer failed /
wiring check failed, 2 usage error (e.g. missing --scope).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Callable, Dict, List, Optional

from ctx import ledger
from ctx.core import (
    GC_KINDS,
    LAYERS,
    LOG_DIR,
    SCOPES,
    Action,
    Context,
    assert_not_raw,
    atomic_write_text,
    build_context,
    ensure_dirs,
    human_bytes,
    load_layer,
    manifest,
    now_iso,
    resolve_scope,
)
from ctx.lock import Locked, hold, is_locked, layer_lock

# --------------------------------------------------------------------------- #
# Logging
# --------------------------------------------------------------------------- #


def _make_logger(cmd: str) -> Callable[[str], None]:
    ensure_dirs()
    log_file = LOG_DIR / "ctx.log"

    def log(msg: str) -> None:
        line = "%s %s %s" % (now_iso(), cmd, msg)
        sys.stderr.write(line + "\n")
        sys.stderr.flush()
        try:
            with open(log_file, "a", encoding="utf-8") as fh:
                fh.write(line + "\n")
        except OSError:
            pass

    return log


def _out(msg: str) -> None:
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()


# --------------------------------------------------------------------------- #
# Argument parser
# --------------------------------------------------------------------------- #


def _add_common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--repo", help="repository root (default: git toplevel of cwd, or none)")
    p.add_argument("--vault", help="llm-wiki vault root (default: configured wikiVault or ~/vaults/llm-wiki)")
    p.add_argument("--grace-seconds", type=int, default=None, help="skip files modified within N seconds (default 600)")
    p.add_argument("--ttl-days", type=int, default=None, help="archive TTL in days (default 30)")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ctx",
        description="Context-lifecycle tool for the mex, zvec, vault and graphify layers.",
    )
    sub = parser.add_subparsers(dest="command", metavar="COMMAND")
    sub.required = True

    p = sub.add_parser("refresh", help="light incremental refresh of each layer in scope (hook-safe)")
    p.add_argument("--scope", required=True, choices=SCOPES)
    _add_common(p)

    p = sub.add_parser("checkpoint", help="full regeneration + GC of each layer in scope (pre-push)")
    p.add_argument("--scope", required=True, choices=SCOPES)
    p.add_argument("--dry-run", action="store_true", help="print the inventory, record it in the ledger, change nothing")
    p.add_argument("--evidence", help="write a before/after markdown evidence file to PATH")
    _add_common(p)

    p = sub.add_parser("gc", help="apply only delete/archive/purge/rotate actions of each layer in scope")
    p.add_argument("--scope", required=True, choices=SCOPES)
    p.add_argument("--dry-run", action="store_true")
    _add_common(p)

    p = sub.add_parser("status", help="read-only freshness facts per layer")
    p.add_argument("--scope", default="all", choices=SCOPES)
    p.add_argument("--check-wiring", action="store_true", help="also audit hook/config wiring; exit 1 on any failure")
    p.add_argument("--json", action="store_true")
    _add_common(p)

    p = sub.add_parser("lock", help="lock utilities")
    lsub = p.add_subparsers(dest="lock_command", metavar="ACTION")
    lsub.required = True
    lp = lsub.add_parser("hold", help="hold a layer lock for N seconds (testing)")
    lp.add_argument("layer", choices=LAYERS)
    lp.add_argument("--for", dest="seconds", type=float, required=True, help="seconds to hold")
    lp = lsub.add_parser("status", help="show which layer locks are currently held")

    p = sub.add_parser("test", help="run a named self-test")
    p.add_argument("name")
    p.add_argument("--vault")
    p.add_argument("--repo")
    p.add_argument("--fixture", action="store_true")
    p.add_argument("--compare-to")

    p = sub.add_parser("install", help="install the shim or a repo pre-push hook")
    p.add_argument("what", choices=("shim", "pre-push"))
    p.add_argument("--repo")

    return parser


# --------------------------------------------------------------------------- #
# Shared machinery
# --------------------------------------------------------------------------- #


class LayerRun:
    """Outcome of processing one layer in checkpoint/gc."""

    def __init__(self, layer: str):
        self.layer = layer
        self.skipped: Optional[str] = None
        self.plan_hash: Optional[str] = None
        self.actions: List[Action] = []
        self.applied: List[dict] = []
        self.failed = 0
        self.refresh_result: Optional[dict] = None
        self.error: Optional[str] = None


def _get_layer(name: str, ctx: Context):
    try:
        return load_layer(name)
    except Exception as exc:  # ImportError or a syntax error inside the module
        ctx.log("%s: layer unavailable (%s: %s)" % (name, type(exc).__name__, exc))
        return None


def _refresh_description(mod, ctx: Context) -> str:
    fn = getattr(mod, "describe_refresh", None)
    if callable(fn):
        try:
            return str(fn(ctx))
        except Exception as exc:
            return "refresh() (describe failed: %s)" % exc
    return str(getattr(mod, "REFRESH_DESCRIPTION", "refresh()"))


def _print_plan(layer: str, actions: List[Action], dry_run: bool, kinds_filter=None) -> None:
    prefix = "DRY-RUN" if dry_run else "PLAN"
    shown = [a for a in actions if kinds_filter is None or a.kind in kinds_filter or a.kind == "note"]
    if not shown:
        _out("%s %s: nothing to do" % (prefix, layer))
        return
    total = sum(a.bytes for a in shown if a.kind != "note")
    for a in shown:
        _out("%s %s" % (prefix, a.describe()))
    _out("%s %s: %d action(s), %s" % (prefix, layer, len([a for a in shown if a.kind != "note"]), human_bytes(total)))


def _apply_actions(mod, ctx: Context, actions: List[Action], run: LayerRun, kinds_filter=None) -> None:
    for a in actions:
        if a.kind == "note":
            continue
        if kinds_filter is not None and a.kind not in kinds_filter:
            continue
        rec = a.to_record()
        try:
            assert_not_raw(a)
            if a.kind in ("delete", "archive", "purge") and Path(a.path).exists() and ctx.in_grace(Path(a.path)):
                raise RuntimeError("inside grace window (mtime < %ds ago)" % ctx.grace_seconds)
            result = mod.apply(a, ctx)
            rec["ok"] = True
            if isinstance(result, dict):
                rec["result"] = result
            ctx.log("applied %s" % a.describe())
            ledger.append(ctx, _action_record(a, run.plan_hash, True, "", result))
        except Exception as exc:
            run.failed += 1
            rec["ok"] = False
            rec["error"] = str(exc)
            ctx.log("FAILED %s: %s" % (a.describe(), exc))
            ledger.append(ctx, _action_record(a, run.plan_hash, False, str(exc), None))
        run.applied.append(rec)


def _action_record(a: Action, plan_hash: Optional[str], ok: bool, error: str, result) -> dict:
    rec = {"type": "action", "ok": ok, "plan_hash": plan_hash}
    rec.update(a.to_record())
    if error:
        rec["error"] = error[:500]
    if isinstance(result, dict):
        try:
            text = json.dumps(result, default=str, sort_keys=True)
        except (TypeError, ValueError):
            text = str(result)
        if len(text) > 4096:
            text = text[:4096]
            rec["result_truncated"] = True
            rec["result_text"] = text
        else:
            rec["result"] = json.loads(text)
    return rec


def _run_mutating(ctx: Context, layers: List[str], mode: str) -> List[LayerRun]:
    """mode = 'checkpoint' | 'gc'. Shared lock → (refresh) → plan → record → apply pipeline."""
    kinds_filter = tuple(GC_KINDS) if mode == "gc" else None
    runs: List[LayerRun] = []
    for name in layers:
        run = LayerRun(name)
        runs.append(run)
        mod = _get_layer(name, ctx)
        if mod is None:
            run.skipped = "layer module unavailable"
            ledger.record_skip(ctx, name, run.skipped)
            _out("SKIP %s: %s" % (name, run.skipped))
            continue
        try:
            lock_cm = layer_lock(name)
            lock_cm.__enter__()
        except Locked as exc:
            run.skipped = "locked: %s" % exc
            ctx.log("skip %s layer: %s" % (name, exc))
            ledger.record_skip(ctx, name, run.skipped)
            _out("SKIP %s: locked (%s)" % (name, exc))
            continue
        try:
            _process_layer(mod, name, ctx, run, mode, kinds_filter)
        except Exception as exc:
            run.error = "%s: %s" % (type(exc).__name__, exc)
            run.failed += 1
            ctx.log("%s layer failed: %s" % (name, run.error))
            _out("ERROR %s: %s" % (name, run.error))
        finally:
            lock_cm.__exit__(None, None, None)
    return runs


def _process_layer(mod, name: str, ctx: Context, run: LayerRun, mode: str, kinds_filter) -> None:
    # 1. refresh (checkpoint only; real mode only — never mutate during dry-run)
    if mode == "checkpoint":
        desc = _refresh_description(mod, ctx)
        if ctx.dry_run:
            _out("DRY-RUN REFRESH %s %s" % (name, desc))
        else:
            ctx.log("%s: refresh — %s" % (name, desc))
            try:
                run.refresh_result = mod.refresh(ctx)
            except Exception as exc:
                run.refresh_result = {"error": str(exc)}
                ctx.log("%s: refresh failed: %s" % (name, exc))
    # 2. plan (pure)
    actions = list(mod.plan(ctx))
    if kinds_filter is not None:
        actions = [a for a in actions if a.kind in kinds_filter or a.kind == "note"]
    for a in actions:
        assert_not_raw(a)
    run.actions = actions
    # 3. print + record
    if ctx.dry_run:
        _print_plan(name, actions, True)
        run.plan_hash = ledger.record_plan(ctx, name, actions, dry_run=True)
        _out("DRY-RUN %s: plan_hash=%s recorded in %s" % (name, run.plan_hash, ctx.ledger_path))
        return
    mutating = [a for a in actions if a.kind != "note"]
    ph = ledger.plan_hash(actions, name)
    if mutating and not ledger.has_dry_run(ctx, ph):
        # Contract: nothing is deleted until a dry-run inventory for the same plan is in the ledger.
        ctx.log("%s: no prior dry-run for plan_hash=%s — recording dry-run inventory first" % (name, ph))
        _print_plan(name, actions, True)
        ledger.record_plan(ctx, name, actions, dry_run=True)
    _print_plan(name, actions, False)
    run.plan_hash = ledger.record_plan(ctx, name, actions, dry_run=False)
    # 4. apply
    _apply_actions(mod, ctx, actions, run, kinds_filter)
    _out("%s %s: applied %d, failed %d" % (mode.upper(), name, len(run.applied) - run.failed, run.failed))


# --------------------------------------------------------------------------- #
# Evidence
# --------------------------------------------------------------------------- #

_DEFAULT_EVIDENCE_EXCLUDE = {
    "vault": ("wiki/ctx-ledger.jsonl", ".obsidian/workspace.json", ".obsidian/workspace-mobile.json"),
}


def _evidence_roots(name: str, mod, ctx: Context) -> List[Path]:
    fn = getattr(mod, "evidence_roots", None) if mod is not None else None
    if callable(fn):
        try:
            roots = [Path(p) for p in fn(ctx)]
            if roots:
                return roots
        except Exception as exc:
            ctx.log("%s: evidence_roots failed: %s" % (name, exc))
    if name == "mex" and ctx.repo:
        return [ctx.repo / ".mex"]
    if name == "zvec":
        roots = [Path.home() / ".zvec-grep" / "daemon" / "logs"]
        if ctx.repo:
            roots.insert(0, ctx.repo / ".zvec-grep")
        return roots
    if name == "vault":
        return [ctx.vault]
    if name == "graphify":
        return [ctx.vault / "graphify-out"]
    return []


def _snapshot(layers: List[str], ctx: Context) -> Dict[str, List[dict]]:
    snap: Dict[str, List[dict]] = {}
    for name in layers:
        mod = None
        try:
            mod = load_layer(name)
        except Exception:
            pass
        entries = []
        for root in _evidence_roots(name, mod, ctx):
            excl = _DEFAULT_EVIDENCE_EXCLUDE.get(name, ())
            if name == "vault" and root != ctx.vault:
                excl = ()
            if name != "vault" and root == ctx.vault:
                excl = _DEFAULT_EVIDENCE_EXCLUDE["vault"]
            entries.append(manifest(root, excl))
        snap[name] = entries
    return snap


def _evidence_markdown(ctx: Context, scope: str, before: dict, after: dict, runs: List[LayerRun], started: str) -> str:
    lines = [
        "# ctx checkpoint evidence",
        "",
        "- scope: `%s`" % scope,
        "- repo: `%s`" % (ctx.repo or "-"),
        "- vault: `%s`" % ctx.vault,
        "- started: %s" % started,
        "- finished: %s" % now_iso(),
        "- dry_run: %s" % ctx.dry_run,
        "- ledger: `%s`" % ctx.ledger_path,
        "",
    ]

    def table(snap: dict) -> List[str]:
        out = ["| layer | root | files | bytes | newest mtime | manifest sha256 |", "|---|---|---:|---:|---|---|"]
        for layer, entries in snap.items():
            if not entries:
                out.append("| %s | - | - | - | - | - |" % layer)
            for e in entries:
                out.append(
                    "| %s | `%s` | %d | %s | %s | `%s` |"
                    % (layer, e["root"], e["files"], human_bytes(e["bytes"]), e["newest_mtime"] or "-", e["sha256"])
                )
        return out

    lines.append("## before")
    lines.append("")
    lines.extend(table(before))
    lines.append("")
    lines.append("## after")
    lines.append("")
    lines.extend(table(after))
    lines.append("")
    lines.append("## layers")
    lines.append("")
    lines.append("| layer | plan_hash | planned | applied | failed | skipped | refresh |")
    lines.append("|---|---|---:|---:|---:|---|---|")
    for r in runs:
        refresh = ""
        if isinstance(r.refresh_result, dict):
            refresh = json.dumps(r.refresh_result, default=str, sort_keys=True)[:200].replace("|", "\\|")
        lines.append(
            "| %s | `%s` | %d | %d | %d | %s | %s |"
            % (
                r.layer,
                r.plan_hash or "-",
                len([a for a in r.actions if a.kind != "note"]),
                len(r.applied) - r.failed,
                r.failed,
                (r.skipped or r.error or "-").replace("|", "\\|"),
                refresh,
            )
        )
    lines.append("")
    lines.append("## applied actions")
    lines.append("")
    lines.append("| layer | kind | path | dest | bytes | ok | note |")
    lines.append("|---|---|---|---|---:|---|---|")
    any_row = False
    for r in runs:
        for rec in r.applied:
            any_row = True
            lines.append(
                "| %s | %s | `%s` | %s | %d | %s | %s |"
                % (
                    rec["layer"],
                    rec["kind"],
                    rec["path"],
                    ("`%s`" % rec["dest"]) if rec.get("dest") else "-",
                    rec.get("bytes") or 0,
                    "yes" if rec.get("ok") else "NO",
                    (rec.get("error") or rec.get("reason") or "").replace("|", "\\|")[:160],
                )
            )
    if not any_row:
        lines.append("| - | - | - | - | - | - | nothing applied |")
    lines.append("")
    lines.append("## notes")
    lines.append("")
    for r in runs:
        for a in r.actions:
            if a.kind == "note":
                lines.append("- %s: `%s` — %s" % (a.layer, a.path, a.reason))
    lines.append("")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #


def cmd_refresh(args) -> int:
    log = _make_logger("refresh")
    ctx = build_context(args, log)
    layers = resolve_scope(args.scope)
    rc = 0
    for name in layers:
        mod = _get_layer(name, ctx)
        if mod is None:
            continue
        try:
            with layer_lock(name):
                if ctx.dry_run:
                    _out("DRY-RUN REFRESH %s %s" % (name, _refresh_description(mod, ctx)))
                    continue
                result = mod.refresh(ctx)
                log("%s: refreshed %s" % (name, json.dumps(result, default=str, sort_keys=True)[:300]))
                _out("REFRESH %s %s" % (name, json.dumps(result, default=str, sort_keys=True)))
        except Locked as exc:
            log("skip %s layer: %s" % (name, exc))
            _out("SKIP %s: locked" % name)
        except Exception as exc:
            log("%s: refresh failed: %s: %s" % (name, type(exc).__name__, exc))
            _out("ERROR %s: %s" % (name, exc))
            # refresh is hook-driven; never fail the hook
    return rc


def cmd_checkpoint(args) -> int:
    log = _make_logger("checkpoint")
    ctx = build_context(args, log)
    layers = resolve_scope(args.scope)
    started = now_iso()
    log("start scope=%s dry_run=%s repo=%s vault=%s" % (args.scope, ctx.dry_run, ctx.repo, ctx.vault))
    before = _snapshot(layers, ctx) if args.evidence else {}
    runs = _run_mutating(ctx, layers, "checkpoint")
    after = _snapshot(layers, ctx) if args.evidence else {}
    if args.evidence:
        text = _evidence_markdown(ctx, args.scope, before, after, runs, started)
        atomic_write_text(Path(args.evidence).expanduser(), text)
        log("evidence written to %s" % args.evidence)
    failed = sum(r.failed for r in runs)
    log("done: %d layer(s), %d failed action(s)" % (len(runs), failed))
    return 1 if failed else 0


def cmd_gc(args) -> int:
    log = _make_logger("gc")
    ctx = build_context(args, log)
    layers = resolve_scope(args.scope)
    log("start scope=%s dry_run=%s repo=%s vault=%s" % (args.scope, ctx.dry_run, ctx.repo, ctx.vault))
    runs = _run_mutating(ctx, layers, "gc")
    failed = sum(r.failed for r in runs)
    return 1 if failed else 0


def cmd_status(args) -> int:
    import contextlib

    log = _make_logger("status")
    quiet_log = (lambda m: None) if args.json else log
    ctx = build_context(args, quiet_log)
    layers = resolve_scope(args.scope)
    report: Dict[str, object] = {
        "ts": now_iso(),
        "scope": args.scope,
        "repo": str(ctx.repo) if ctx.repo else None,
        "vault": str(ctx.vault),
        "layers": {},
    }
    layer_status: Dict[str, dict] = report["layers"]  # type: ignore[assignment]
    # In --json mode nothing but the final document may reach stdout: route stray prints to stderr.
    guard = contextlib.redirect_stdout(sys.stderr) if args.json else contextlib.nullcontext()
    with guard:
        for name in layers:
            try:
                mod = load_layer(name)
                st = mod.status(ctx)
                if not isinstance(st, dict):
                    st = {"value": st}
            except Exception as exc:
                st = {"error": "%s: %s" % (type(exc).__name__, exc)}
            st = dict(st)
            st["locked"] = is_locked(name)
            layer_status[name] = st
        wiring_failed = 0
        if args.check_wiring:
            from ctx import wiring

            results = wiring.audit(ctx)
            report["wiring"] = [{"check": c, "ok": ok, "detail": d} for (c, ok, d) in results]
            wiring_failed = sum(1 for (_, ok, _) in results if not ok)
            report["wiring_ok"] = wiring_failed == 0
    if args.json:
        _out(json.dumps(report, indent=2, default=str, sort_keys=True))
    else:
        for name, st in layer_status.items():
            _out("[%s]" % name)
            for k in sorted(st):
                _out("  %s: %s" % (k, json.dumps(st[k], default=str) if isinstance(st[k], (dict, list)) else st[k]))
        if args.check_wiring:
            _out("[wiring]")
            for item in report["wiring"]:  # type: ignore[union-attr]
                _out("  %s %s — %s" % ("ok  " if item["ok"] else "FAIL", item["check"], item["detail"]))
            _out("wiring: %s" % ("OK" if wiring_failed == 0 else "%d check(s) failed" % wiring_failed))
    return 1 if wiring_failed else 0


def cmd_lock(args) -> int:
    if args.lock_command == "status":
        for name in LAYERS:
            _out("%s: %s" % (name, "held" if is_locked(name) else "free"))
        return 0
    seconds = float(args.seconds)
    try:
        _out("holding %s lock for %.1fs (pid %d)" % (args.layer, seconds, __import__("os").getpid()))
        hold(args.layer, seconds)
        _out("released %s lock" % args.layer)
        return 0
    except Locked as exc:
        _out("cannot hold: %s" % exc)
        return 1


def cmd_test(args) -> int:
    from ctx import tests

    return tests.run(args.name, args)


def cmd_install(args) -> int:
    from ctx import install

    if args.what == "shim":
        path = install.shim()
        _out("installed shim: %s" % path)
        return 0
    repo = Path(args.repo).expanduser().resolve() if args.repo else None
    if repo is None:
        from ctx.core import git_toplevel

        repo = git_toplevel()
    if repo is None:
        sys.stderr.write("ctx install pre-push: --repo is required outside a git repository\n")
        return 2
    path = install.pre_push(repo)
    _out("installed pre-push hook: %s" % path)
    _out("  runs: ctx checkpoint --scope all --repo %s (best-effort, then the original `git lfs pre-push`)" % repo)
    _out("  env passthrough: set CTX_DRY_RUN=1 in the pushing shell to force an inventory-only (dry-run) checkpoint")
    return 0


COMMANDS = {
    "refresh": cmd_refresh,
    "checkpoint": cmd_checkpoint,
    "gc": cmd_gc,
    "status": cmd_status,
    "lock": cmd_lock,
    "test": cmd_test,
    "install": cmd_install,
}


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    fn = COMMANDS[args.command]
    try:
        return int(fn(args) or 0)
    except KeyboardInterrupt:
        return 130
