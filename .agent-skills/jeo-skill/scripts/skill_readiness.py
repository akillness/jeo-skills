"""Read-only readiness report for the GitHub program operator skills.

Each operator ships an offline `scripts/preflight.py` that reads host facts and never runs the
upstream program, opens a socket, or writes a file. This module runs those helpers for the installed
skills, folds their JSON into one short report, and keeps "blocked" (a missing prerequisite) apart
from "error" (a helper that could not report). It installs nothing, so no approval is needed to run it.

Exit codes of `report`: 0 every program is ready, 1 at least one is blocked or not installed,
2 a helper failed to produce a valid report.
"""
from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

READINESS_SKILLS = ("fabric", "moneyprinter-v2", "agent-s", "google-maps-scraper", "gitingest")
TIMEOUT = 30
MAX_OUTPUT = 1 << 20
DETAIL_WIDTH = 170
LABELS = {"ready": "ready", "blocked": "blocked", "error": "error", "missing": "not installed"}
STATE_FROM_STATUS = {"ok": "ready", "blocked": "blocked", "error": "error"}


def helper_path(root: Path, name: str) -> Path:
    return root / name / "scripts" / "preflight.py"


def plan(root: Path | None, names: list[str]) -> list[tuple[str, list[str]]]:
    if root is None:
        return []
    return [(name, [sys.executable, "-I", "-B", str(helper_path(root, name)), "--json"]) for name in names]


def probe(root: Path, name: str, timeout: float = TIMEOUT) -> dict:
    """Run one helper and return {skill, state, blocked, info, detail, checks}; never raises."""
    result = {"skill": name, "state": "error", "blocked": [], "info": 0, "detail": "", "checks": []}
    script = helper_path(root, name)
    if not script.is_file():
        result.update(state="missing", detail=f"{script.parent.parent.name} has no preflight helper at {script}")
        return result
    _, command = plan(root, [name])[0]
    try:
        done = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace",
                              timeout=timeout, check=False, stdin=subprocess.DEVNULL, env=os.environ.copy())
    except subprocess.TimeoutExpired:
        result["detail"] = f"helper did not finish within {timeout:g} s"
        return result
    except OSError as error:
        result["detail"] = f"helper could not start ({error.strerror or type(error).__name__})"
        return result
    try:
        if len(done.stdout) > MAX_OUTPUT:
            raise ValueError("output too large")
        report = json.loads(done.stdout)
        checks = report["checks"]
        valid = (report["skill"] == name and report["scope"] == "offline-preflight"
                 and report["status"] in STATE_FROM_STATUS and isinstance(checks, list))
    except (ValueError, KeyError, TypeError):
        valid = False
    if not valid or done.returncode == 2:
        result["detail"] = f"helper exited {done.returncode} without a valid offline-preflight report"
        return result
    result["state"] = STATE_FROM_STATUS[report["status"]]
    result["checks"] = [{"name": str(c.get("name", "?")), "status": str(c.get("status", "")),
                         "detail": str(c.get("detail", ""))} for c in checks if isinstance(c, dict)]
    result["blocked"] = [(c["name"], c["detail"]) for c in result["checks"] if c["status"] in ("blocked", "error")]
    result["info"] = sum(1 for c in result["checks"] if c["status"] == "info")
    return result


def collect(root: Path, names: list[str]) -> list[dict]:
    return [probe(root, name) for name in names]


def exit_code(results: list[dict]) -> int:
    if any(r["state"] == "error" for r in results):
        return 2
    return 0 if all(r["state"] == "ready" for r in results) else 1


def shorten(text: str) -> str:
    text = " ".join(text.split())
    return text if len(text) <= DETAIL_WIDTH else text[: DETAIL_WIDTH - 1].rstrip() + "…"


def render(results: list[dict]) -> str:
    lines = ["Program readiness (offline and read-only; nothing was installed, started or contacted):"]
    for r in results:
        line = f"- {r['skill']}: {LABELS[r['state']]}"
        if r["blocked"]:
            line += f" ({len(r['blocked'])} blocking)"
        if r["info"]:
            line += f", {r['info']} advisory finding(s)"
        lines.append(line)
        lines.extend(f"    - {name}: {shorten(detail)}" for name, detail in r["blocked"])
        if r["detail"]:
            lines.append(f"    - {shorten(r['detail'])}")
    ready = sum(1 for r in results if r["state"] == "ready")
    lines.append(f"{ready}/{len(results)} ready. A blocked item names a missing prerequisite; installing or running "
                 "a program is a separate approval. Re-run with --json for every finding.")
    return "\n".join(lines)


def report(root: Path | None, names: list[str], *, as_json: bool = False) -> int:
    if root is None:
        print("jeo-skill: readiness needs a verifiable skills root for this agent", file=sys.stderr)
        return 2
    results = collect(root, names)
    if as_json:
        ready = sum(1 for r in results if r["state"] == "ready")
        payload = {"scope": "readiness", "ready": ready, "total": len(results),
                   "results": [{"skill": r["skill"], "state": r["state"], "detail": r["detail"], "checks": r["checks"]}
                               for r in results]}
        print(json.dumps(payload, indent=2, ensure_ascii=False))
    else:
        print(render(results))
    return exit_code(results)


def describe_plan(root: Path | None, names: list[str]) -> list[str]:
    return [f"Readiness plan ({name}): {shlex.join(command)}" for name, command in plan(root, names)]
