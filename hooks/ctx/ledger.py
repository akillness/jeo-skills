"""Append-only ledger: <vault>/wiki/ctx-ledger.jsonl (one JSON object per line).

Record types:
  plan    – inventory of planned actions for a scope (dry_run True/False) + plan_hash
  action  – one applied delete/archive/purge/rotate/regenerate (never written on dry-run)
  skip    – a layer was skipped (locked / unavailable)
  note    – free-form (version warnings, gitignore advice)

`record_plan()` is written on dry-run AND real runs; a real mutating run must
find a prior `plan` record with dry_run=true for the same plan_hash
(`has_dry_run`) before it may apply anything.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Iterable, List, Optional

from ctx.core import Action, Context, append_line, now_iso


def _path(ctx: Context) -> Path:
    return Path(ctx.ledger_path)


def append(ctx: Context, record: dict) -> None:
    rec = dict(record)
    rec.setdefault("ts", now_iso())
    rec.setdefault("scope", getattr(ctx, "scope", "all"))
    rec.setdefault("dry_run", bool(ctx.dry_run))
    append_line(_path(ctx), json.dumps(rec, sort_keys=True, ensure_ascii=False))


def plan_hash(actions: Iterable[Action], scope: str = "") -> str:
    """Stable hash over (scope, sorted kind|layer|path|dest); reasons/bytes excluded."""
    keys = sorted("%s|%s|%s|%s" % (a.kind, a.layer, a.path, a.dest or "") for a in actions)
    h = hashlib.sha256()
    h.update(("scope=" + scope + "\n").encode("utf-8"))
    for k in keys:
        h.update((k + "\n").encode("utf-8"))
    return h.hexdigest()[:16]


def record_plan(ctx: Context, scope: str, actions: List[Action], dry_run: bool) -> str:
    ph = plan_hash(actions, scope)
    counts: dict = {}
    for a in actions:
        counts[a.kind] = counts.get(a.kind, 0) + 1
    append(
        ctx,
        {
            "type": "plan",
            "scope": scope,
            "dry_run": bool(dry_run),
            "plan_hash": ph,
            "counts": counts,
            "repo": str(ctx.repo) if ctx.repo else None,
            "vault": str(ctx.vault),
            "actions": [a.to_record() for a in actions],
        },
    )
    return ph


def record_action(ctx: Context, action: Action, plan_hash_value: Optional[str] = None, ok: bool = True, error: str = "") -> None:
    if ctx.dry_run:
        return
    rec = {"type": "action", "ok": bool(ok), "plan_hash": plan_hash_value}
    rec.update(action.to_record())
    if error:
        rec["error"] = error[:500]
    append(ctx, rec)


def record_skip(ctx: Context, layer: str, reason: str) -> None:
    append(ctx, {"type": "skip", "layer": layer, "reason": reason})


def record_note(ctx: Context, layer: str, text: str) -> None:
    append(ctx, {"type": "note", "layer": layer, "text": text})


def iter_records(ctx: Context) -> Iterable[dict]:
    p = _path(ctx)
    if not p.is_file():
        return
    with open(p, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except ValueError:
                continue


def has_dry_run(ctx: Context, plan_hash_value: str) -> bool:
    for rec in iter_records(ctx):
        if rec.get("type") == "plan" and rec.get("dry_run") and rec.get("plan_hash") == plan_hash_value:
            return True
    return False


def last_plan(ctx: Context, scope: Optional[str] = None, dry_run: Optional[bool] = None) -> Optional[dict]:
    found = None
    for rec in iter_records(ctx):
        if rec.get("type") != "plan":
            continue
        if scope is not None and rec.get("scope") != scope:
            continue
        if dry_run is not None and bool(rec.get("dry_run")) != dry_run:
            continue
        found = rec
    return found
