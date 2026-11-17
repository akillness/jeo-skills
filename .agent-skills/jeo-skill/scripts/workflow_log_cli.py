"""Unified workflow log writer and CLI (`jeo-skill flow-log` & `jeo-flow-log`).

Tracks every workflow step across global default flows and isolated per-project
custom flows (`customWorkflow: true` / `.harness2/workspace.json` `workflow.custom`)
inside a single canonical JSONL ledger under `${JEO_SKILL_STATE_DIR:-~/.local/state/jeo-skill}`.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import stat
import sys
import uuid
from typing import Any

sys.dont_write_bytecode = True

COMMANDS = ("flow-log",)
NO_CATALOG_COMMANDS = ("flow-log",)
LEDGER_NAME = "workflow-events.jsonl"
DEFAULT_ORDER = ("openspace", "rtk", "semble", "jev", "memory")
ROTATE_BYTES = 5 * 1024 * 1024
RETENTION_BYTES = 20 * 1024 * 1024
SEGMENT_RE = re.compile(r"^workflow-events\..+\.jsonl$")
SECRET_RE = re.compile(
    r"(?:sk-[A-Za-z0-9_-]{12,}|ctx7sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|"
    r"AIza[0-9A-Za-z_-]{20,}|(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,})"
)


def scrub(value: Any) -> Any:
    """Redact credential-like tokens recursively before persistence or display."""
    if isinstance(value, str):
        return SECRET_RE.sub("[REDACTED]", value)
    if isinstance(value, list):
        return [scrub(v) for v in value]
    if isinstance(value, tuple):
        return [scrub(v) for v in value]
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for k, v in value.items():
            ks = str(k)
            if any(s in ks.upper() for s in ("API_KEY", "SECRET", "TOKEN", "PASSWORD")) and v not in (None, "", False, True):
                out[ks] = "[REDACTED]"
            else:
                out[ks] = scrub(v)
        return out
    return value


def state_dir(home: Path | None = None) -> Path:
    env = os.environ.get("JEO_SKILL_STATE_DIR", "").strip()
    if env:
        return Path(env).expanduser()
    base_home = Path(home).expanduser() if home else Path.home()
    return base_home / ".local" / "state" / "jeo-skill"


def ledger_path(home: Path | None = None) -> Path:
    return state_dir(home) / LEDGER_NAME


def _rotated_segments(directory: Path) -> list[Path]:
    try:
        items = [
            p for p in directory.iterdir()
            if not p.is_symlink() and p.is_file() and (SEGMENT_RE.match(p.name) or p.name == "workflow-events.1.jsonl")
        ]
    except OSError:
        return []
    return sorted(items, key=lambda p: (p.stat().st_mtime, p.name), reverse=True)


def _rotate_if_needed(ledger: Path, directory: Path) -> None:
    try:
        st = ledger.lstat()
    except FileNotFoundError:
        return
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or st.st_size < ROTATE_BYTES:
        return
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rotated = directory / f"workflow-events.{stamp}-{os.getpid()}-{uuid.uuid4().hex[:8]}.jsonl"
    try:
        os.replace(ledger, rotated)
    except FileNotFoundError:
        return
    retained = 0
    for idx, seg in enumerate(_rotated_segments(directory)):
        try:
            sz = seg.lstat().st_size
        except OSError:
            continue
        retained += sz
        if idx > 0 and retained > RETENTION_BYTES:
            try:
                seg.unlink(missing_ok=True)
            except OSError:
                pass


def detect_project_flow(cwd_or_project: str | Path | None, home: Path | None = None) -> dict[str, Any]:
    """Resolve effective workflow metadata (`global` vs `project-custom`) from `.harness2/workspace.json`."""
    fallback = {
        "project": str(Path(cwd_or_project).expanduser().resolve()) if cwd_or_project else None,
        "flow_mode": "global",
        "workflow_order": list(DEFAULT_ORDER),
        "jev_profile": None,
    }
    if not cwd_or_project:
        return fallback
    try:
        cur = Path(cwd_or_project).expanduser().resolve()
        home_real = (Path(home).expanduser() if home else Path.home()).resolve()
    except OSError:
        return fallback
    for _ in range(12):
        if cur == home_real:
            break
        manifest = cur / ".harness2" / "workspace.json"
        try:
            if not manifest.is_symlink() and manifest.is_file() and manifest.stat().st_size <= 262_144:
                data = json.loads(manifest.read_text(encoding="utf-8"))
                wf = data.get("workflow") if isinstance(data, dict) else None
                if isinstance(wf, dict):
                    is_custom = wf.get("custom") is True
                    order = wf.get("order")
                    return {
                        "project": str(cur),
                        "flow_mode": "project-custom" if is_custom else "global",
                        "workflow_order": list(order) if isinstance(order, list) and order else list(DEFAULT_ORDER),
                        "jev_profile": wf.get("jev_profile"),
                    }
                return {**fallback, "project": str(cur)}
        except (OSError, ValueError):
            break
        if cur.parent == cur:
            break
        cur = cur.parent
    return fallback


def normalize_event(raw: dict[str, Any]) -> dict[str, Any]:
    """Normalize both v1 and earlier legacy events into one consistent schema."""
    ev = dict(raw)
    flow_mode = ev.get("flow_mode")
    if flow_mode not in ("global", "project-custom"):
        is_custom = bool(ev.get("customProject") or ev.get("custom"))
        flow_mode = "project-custom" if is_custom else "global"
    order = ev.get("workflow_order") or ev.get("order") or list(DEFAULT_ORDER)
    if not isinstance(order, list):
        order = list(DEFAULT_ORDER)
    host = ev.get("host") or ev.get("agent")
    outcome = ev.get("outcome")
    if not outcome:
        if ev.get("skipped"):
            outcome = "skipped"
        elif ev.get("failed"):
            outcome = "failed"
        else:
            outcome = "ok"
    ev["v"] = ev.get("v") or 1
    ev["flow_mode"] = flow_mode
    ev["workflow_order"] = order
    ev["host"] = host
    ev["outcome"] = outcome
    return ev


def record_event(
    stage: str,
    outcome: str = "ok",
    *,
    project: str | Path | None = None,
    host: str | None = None,
    duration_ms: float | None = None,
    details: dict[str, Any] | None = None,
    home: Path | None = None,
) -> dict[str, Any]:
    """Append one scrubbed JSONL event safely to the unified workflow ledger."""
    directory = state_dir(home)
    directory.mkdir(parents=True, exist_ok=True)
    d_info = directory.lstat()
    if stat.S_ISLNK(d_info.st_mode) or not stat.S_ISDIR(d_info.st_mode):
        raise OSError(f"Refusing non-directory state dir: {directory}")
    os.chmod(directory, 0o700)

    ledger = directory / LEDGER_NAME
    if ledger.is_symlink():
        raise OSError(f"Refusing symlinked workflow ledger: {ledger}")
    _rotate_if_needed(ledger, directory)

    flow_info = detect_project_flow(project, home=home)
    payload: dict[str, Any] = {
        "v": 1,
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stage": stage,
        "outcome": outcome,
        "flow_mode": flow_info["flow_mode"],
        "workflow_order": flow_info["workflow_order"],
        "project": flow_info["project"],
        "host": host,
    }
    if flow_info.get("jev_profile") is not None:
        payload["jev_profile"] = flow_info["jev_profile"]
    if duration_ms is not None:
        payload["duration_ms"] = round(float(duration_ms), 2)
    if details:
        for k, v in details.items():
            if k not in ("v", "ts"):
                payload[k] = v
    clean = scrub(payload)
    line = json.dumps(clean, ensure_ascii=False, sort_keys=True) + "\n"
    fd = os.open(str(ledger), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    try:
        os.write(fd, line.encode("utf-8"))
        os.fchmod(fd, 0o600)
    finally:
        os.close(fd)
    return clean


def iter_all_events(home: Path | None = None) -> tuple[list[dict[str, Any]], int]:
    """Read rotated segments (oldest-first) + live ledger, returning (events, parse_errors)."""
    directory = state_dir(home)
    if not directory.is_dir():
        return [], 0
    files = list(reversed(_rotated_segments(directory)))
    live = directory / LEDGER_NAME
    if not live.is_symlink() and live.is_file():
        files.append(live)

    events: list[dict[str, Any]] = []
    errors = 0
    for fpath in files:
        try:
            text = fpath.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line in text.splitlines():
            s = line.strip()
            if not s:
                continue
            try:
                parsed = json.loads(s)
            except ValueError:
                errors += 1
                continue
            if isinstance(parsed, dict):
                events.append(normalize_event(parsed))
            else:
                errors += 1
    return events, errors


def _filter_events(
    events: list[dict[str, Any]],
    *,
    custom_only: bool = False,
    global_only: bool = False,
    project: str | None = None,
    stage: str | None = None,
    host: str | None = None,
    outcome: str | None = None,
) -> list[dict[str, Any]]:
    proj_resolved = str(Path(project).expanduser().resolve()) if project else None
    out = []
    for ev in events:
        if custom_only and ev.get("flow_mode") != "project-custom":
            continue
        if global_only and ev.get("flow_mode") != "global":
            continue
        if proj_resolved:
            ev_proj = ev.get("project")
            if not ev_proj:
                continue
            try:
                ev_resolved = str(Path(ev_proj).expanduser().resolve())
            except OSError:
                ev_resolved = str(ev_proj)
            if ev_resolved != proj_resolved:
                continue
        if stage and not str(ev.get("stage", "")).startswith(stage):
            continue
        if host and ev.get("host") != host:
            continue
        if outcome and ev.get("outcome") != outcome:
            continue
        out.append(ev)
    return out


def _format_line(ev: dict[str, Any]) -> str:
    mode_tag = "CUSTOM" if ev.get("flow_mode") == "project-custom" else "GLOBAL"
    order_str = "->".join(str(x) for x in (ev.get("workflow_order") or DEFAULT_ORDER))
    host_str = ev.get("host") or "-"
    dur = f" ({ev['duration_ms']}ms)" if isinstance(ev.get("duration_ms"), (int, float)) else ""
    extras = []
    if ev.get("project"):
        extras.append(f"proj={ev['project']}")
    if ev.get("skipped"):
        extras.append(f"reason={ev['skipped']}")
    elif ev.get("routed"):
        extras.append(f"routed={','.join(str(x) for x in ev['routed'])}")
    elif ev.get("strategy"):
        extras.append(f"strategy={ev['strategy']}")
    elif ev.get("symbols") is not None:
        extras.append(f"symbols={ev['symbols']}")
    elif ev.get("query_hits") is not None:
        extras.append(f"hits={ev['query_hits']}")
    tail = (" " + " ".join(extras)) if extras else ""
    return f"{ev.get('ts', '?')} [{mode_tag} {order_str}] [{host_str}] {ev.get('stage', '?')} -> {ev.get('outcome', 'ok')}{dur}{tail}"


def build_summary(events: list[dict[str, Any]]) -> dict[str, Any]:
    by_mode: dict[str, int] = {"global": 0, "project-custom": 0}
    by_stage: dict[str, int] = {}
    by_outcome: dict[str, int] = {}
    by_host: dict[str, int] = {}
    custom_projects: dict[str, dict[str, Any]] = {}

    for ev in events:
        fm = ev.get("flow_mode", "global")
        by_mode[fm] = by_mode.get(fm, 0) + 1
        st = str(ev.get("stage") or "unknown")
        by_stage[st] = by_stage.get(st, 0) + 1
        oc = str(ev.get("outcome") or "ok")
        by_outcome[oc] = by_outcome.get(oc, 0) + 1
        ht = str(ev.get("host") or "-")
        by_host[ht] = by_host.get(ht, 0) + 1
        if fm == "project-custom" and ev.get("project"):
            proj = str(ev["project"])
            slot = custom_projects.setdefault(proj, {
                "workflow_order": ev.get("workflow_order") or [],
                "jev_profile": ev.get("jev_profile"),
                "events": 0,
                "stages": {},
                "last_ts": None,
            })
            slot["workflow_order"] = ev.get("workflow_order") or slot["workflow_order"]
            if ev.get("jev_profile") is not None:
                slot["jev_profile"] = ev["jev_profile"]
            slot["events"] += 1
            slot["stages"][st] = slot["stages"].get(st, 0) + 1
            slot["last_ts"] = ev.get("ts") or slot["last_ts"]

    return {
        "ledger": str(ledger_path()),
        "total": len(events),
        "by_flow_mode": by_mode,
        "by_stage": dict(sorted(by_stage.items())),
        "by_outcome": dict(sorted(by_outcome.items())),
        "by_host": dict(sorted(by_host.items())),
        "custom_projects": custom_projects,
    }


def _cmd_doctor(as_json: bool) -> int:
    directory = state_dir()
    live = directory / LEDGER_NAME
    issues: list[str] = []
    if directory.exists():
        d_st = directory.lstat()
        if stat.S_ISLNK(d_st.st_mode) or not stat.S_ISDIR(d_st.st_mode):
            issues.append(f"state dir is symlink or non-dir: {directory}")
        elif stat.S_IMODE(d_st.st_mode) & 0o077:
            issues.append(f"state dir permissions too open ({oct(stat.S_IMODE(d_st.st_mode))}): {directory}")
    if live.is_symlink():
        issues.append(f"ledger must not be a symlink: {live}")
    elif live.exists():
        l_st = live.lstat()
        if stat.S_IMODE(l_st.st_mode) & 0o077:
            issues.append(f"ledger permissions too open ({oct(stat.S_IMODE(l_st.st_mode))}): {live}")

    events, parse_errors = iter_all_events()
    if parse_errors:
        issues.append(f"{parse_errors} malformed JSONL lines across flow ledger")
    summ = build_summary(events)
    segments = _rotated_segments(directory)
    total_bytes = sum(p.lstat().st_size for p in segments if p.exists()) + (live.lstat().st_size if live.is_file() and not live.is_symlink() else 0)
    report = {
        "ok": not issues,
        "ledger": str(live),
        "exists": live.is_file() and not live.is_symlink(),
        "segments": len(segments),
        "total_bytes": total_bytes,
        "events": len(events),
        "parse_errors": parse_errors,
        "by_flow_mode": summ["by_flow_mode"],
        "custom_projects_count": len(summ["custom_projects"]),
        "issues": issues,
    }
    if as_json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        print(f"flow-log ledger : {report['ledger']} ({'OK' if report['ok'] else 'ISSUES'})")
        print(f"events / size   : {report['events']} events, {report['total_bytes']} bytes, {report['segments']} rotated segments")
        print(f"flow breakdown  : global={summ['by_flow_mode']['global']} project-custom={summ['by_flow_mode']['project-custom']} ({report['custom_projects_count']} custom project(s))")
        if issues:
            for iss in issues:
                print(f"ISSUE: {iss}")
    return 0 if report["ok"] else 1


def _add_flow_subcommands(sub: argparse._SubParsersAction) -> None:
    p_path = sub.add_parser("path", help="Show unified workflow ledger path and size")
    p_path.add_argument("--json", action="store_true")

    p_tail = sub.add_parser("tail", help="Show recent unified workflow events")
    p_tail.add_argument("-n", "--limit", type=int, default=25)
    p_tail.add_argument("--custom-only", action="store_true")
    p_tail.add_argument("--global-only", action="store_true")
    p_tail.add_argument("--project")
    p_tail.add_argument("--stage")
    p_tail.add_argument("--host")
    p_tail.add_argument("--outcome")
    p_tail.add_argument("--json", action="store_true")

    p_sum = sub.add_parser("summary", help="Aggregate global vs per-project custom workflow stats")
    p_sum.add_argument("--custom-only", action="store_true")
    p_sum.add_argument("--project")
    p_sum.add_argument("--json", action="store_true")

    p_rec = sub.add_parser("record", help="Append one workflow event to the unified ledger")
    p_rec.add_argument("--stage", required=True)
    p_rec.add_argument("--outcome", default="ok")
    p_rec.add_argument("--project")
    p_rec.add_argument("--host")
    p_rec.add_argument("--duration-ms", type=float)
    p_rec.add_argument("--detail", help="Optional JSON object with extra fields")
    p_rec.add_argument("--json", action="store_true")

    p_doc = sub.add_parser("doctor", help="Audit workflow ledger permissions, rotation, and JSONL validity")
    p_doc.add_argument("--json", action="store_true")

    p_clr = sub.add_parser("clear", help="Prune old rotated workflow log segments (preview unless --apply)")
    p_clr.add_argument("--older-than", type=int, default=14, metavar="DAYS")
    p_clr.add_argument("--apply", action="store_true")
    p_clr.add_argument("--json", action="store_true")


def add_parsers(sub: argparse._SubParsersAction) -> None:
    fl = sub.add_parser("flow-log", help="Inspect and manage the unified global/per-project workflow log")
    actions = fl.add_subparsers(dest="flow_command", required=True)
    _add_flow_subcommands(actions)


def run(args: argparse.Namespace) -> int:
    cmd = getattr(args, "flow_command", None)
    as_json = bool(getattr(args, "json", False))

    if cmd == "path":
        directory = state_dir()
        live = directory / LEDGER_NAME
        segs = _rotated_segments(directory)
        total_bytes = sum(p.lstat().st_size for p in segs if p.exists()) + (live.lstat().st_size if live.is_file() and not live.is_symlink() else 0)
        info = {"ledger": str(live), "exists": live.is_file() and not live.is_symlink(), "segments": len(segs), "total_bytes": total_bytes}
        print(json.dumps(info, indent=2) if as_json else str(live))
        return 0

    if cmd == "doctor":
        return _cmd_doctor(as_json)

    if cmd == "record":
        extra = {}
        if getattr(args, "detail", None):
            parsed = json.loads(args.detail)
            if not isinstance(parsed, dict):
                raise ValueError("--detail must be a JSON object")
            extra = parsed
        ev = record_event(
            args.stage,
            outcome=args.outcome,
            project=args.project,
            host=args.host,
            duration_ms=args.duration_ms,
            details=extra,
        )
        print(json.dumps(ev, indent=2, ensure_ascii=False) if as_json else _format_line(ev))
        return 0

    if cmd == "clear":
        directory = state_dir()
        segs = _rotated_segments(directory)
        cutoff = datetime.now(timezone.utc).timestamp() - max(0, int(args.older_than)) * 86400
        candidates = [p for p in segs if p.stat().st_mtime <= cutoff]
        live = directory / LEDGER_NAME
        truncate_live = int(args.older_than) == 0 and live.is_file() and not live.is_symlink()
        removed = []
        if args.apply:
            for p in candidates:
                p.unlink(missing_ok=True)
                removed.append(str(p))
            if truncate_live:
                live.write_text("", encoding="utf-8")
                os.chmod(live, 0o600)
                removed.append(str(live))
        payload = {
            "apply": bool(args.apply),
            "older_than_days": int(args.older_than),
            "candidates": [str(p) for p in candidates] + ([str(live)] if truncate_live else []),
            "removed": removed,
        }
        if as_json:
            print(json.dumps(payload, indent=2))
        else:
            verb = "removed" if args.apply else "would remove"
            print(f"{verb} {len(payload['candidates'])} flow-log file(s)")
        return 0

    events, _ = iter_all_events()
    filtered = _filter_events(
        events,
        custom_only=bool(getattr(args, "custom_only", False)),
        global_only=bool(getattr(args, "global_only", False)),
        project=getattr(args, "project", None),
        stage=getattr(args, "stage", None),
        host=getattr(args, "host", None),
        outcome=getattr(args, "outcome", None),
    )

    if cmd == "tail":
        limit = max(1, int(getattr(args, "limit", 25)))
        slice_ev = filtered[-limit:]
        if as_json:
            print(json.dumps({"ledger": str(ledger_path()), "count": len(slice_ev), "events": slice_ev}, indent=2, ensure_ascii=False))
        elif not slice_ev:
            print("(no matching workflow events)")
        else:
            for ev in slice_ev:
                print(_format_line(ev))
        return 0

    if cmd == "summary":
        summ = build_summary(filtered)
        if as_json:
            print(json.dumps(summ, indent=2, ensure_ascii=False))
        else:
            print(f"Unified flow ledger : {summ['ledger']}")
            print(f"Total events        : {summ['total']} (global={summ['by_flow_mode']['global']}, project-custom={summ['by_flow_mode']['project-custom']})")
            print(f"By stage            : {json.dumps(summ['by_stage'], ensure_ascii=False)}")
            print(f"By outcome          : {json.dumps(summ['by_outcome'], ensure_ascii=False)}")
            print(f"By host             : {json.dumps(summ['by_host'], ensure_ascii=False)}")
            if summ["custom_projects"]:
                print("Custom-isolated projects:")
                for proj, info in summ["custom_projects"].items():
                    order_s = "->".join(str(x) for x in info["workflow_order"])
                    print(f"  - {proj} order=[{order_s}] jev_profile={info['jev_profile']} events={info['events']} last={info['last_ts']}")
        return 0

    return 2
