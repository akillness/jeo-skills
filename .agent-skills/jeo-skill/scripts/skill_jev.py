#!/usr/bin/env python3
"""Jev review and relevance gates for unused-skill operations.

The module deliberately keeps the payloads sent to Jev small and structured:
review requests contain skill names, scopes, and usage evidence summaries only;
relevance requests contain bounded repository README/AGENTS summaries only.
"""

from __future__ import annotations

import math
import json
import re
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable

sys.dont_write_bytecode = True

HARNESS_ENV = "JEO_SKILL_JEV_HARNESS"
DEFAULT_HARNESS = Path.home() / ".agents" / "jev" / "jev-harness.mjs"
FIT_THRESHOLD = 0.30
SUMMARY_LIMIT = 6 * 1024


class JevGateError(RuntimeError):
    """Raised when a Jev gate cannot authorize a mutating operation."""


def harness_path() -> Path:
    """Return the configured Jev harness path without touching the filesystem."""
    configured = os.environ.get(HARNESS_ENV)
    return Path(configured).expanduser() if configured else DEFAULT_HARNESS


def _command(*args: str) -> list[str]:
    path = harness_path()
    # Test harnesses are allowed to be tiny Python scripts; production is the
    # Node ESM harness specified by the contract.
    interpreter = sys.executable if path.suffix == ".py" else "node"
    return [interpreter, str(path), *args]


def _run(args: Iterable[str], *, timeout: float, env: dict[str, str] | None = None) -> tuple[int, str, str, str | None]:
    try:
        completed = subprocess.run(
            _command(*args),
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=max(0.01, timeout),
            env=env,
        )
    except subprocess.TimeoutExpired:
        return -1, "", "", "timeout"
    except (OSError, ValueError):
        return -1, "", "", "execution failed"
    return completed.returncode, completed.stdout, completed.stderr, None


def _json_output(text: str) -> Any | None:
    """Parse one strict JSON value, allowing a diagnostic prefix only."""
    stripped = text.strip()
    if not stripped:
        return None

    def reject_constant(value: str) -> None:
        raise ValueError(f"non-finite JSON constant: {value}")

    try:
        return json.loads(stripped, parse_constant=reject_constant)
    except (json.JSONDecodeError, ValueError):
        decoder = json.JSONDecoder(parse_constant=reject_constant)
        candidates: list[tuple[int, Any]] = []
        for index, char in enumerate(stripped):
            if char not in "[{":
                continue
            try:
                value, end = decoder.raw_decode(stripped[index:])
            except (json.JSONDecodeError, ValueError):
                continue
            # Allow a diagnostic prefix, but reject any trailing output.
            if stripped[index + end :].strip():
                continue
            candidates.append((index + end, value))
        return max(candidates, key=lambda item: item[0])[1] if candidates else None


def _unique_strings(value: Any) -> list[str]:
    values: list[str] = []
    if isinstance(value, str):
        value = [value]
    if isinstance(value, (tuple, list, set)):
        for item in value:
            if isinstance(item, str) and item and item not in values:
                values.append(item)
    return values


def _extract_names(proposal: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for key in ("skills", "names", "candidates"):
        for name in _unique_strings(proposal.get(key)):
            if name not in names:
                names.append(name)
    singular = proposal.get("skill")
    for name in _unique_strings(singular):
        if name not in names:
            names.append(name)
    items = proposal.get("items")
    if isinstance(items, list):
        for item in items:
            if isinstance(item, dict):
                name = item.get("skill") or item.get("name")
                if isinstance(name, str) and name and name not in names:
                    names.append(name)
    return sorted(names)


def _extract_scopes(proposal: dict[str, Any]) -> list[str]:
    scopes: list[str] = []
    for key in ("scopes", "scope"):
        value = proposal.get(key)
        if isinstance(value, dict):
            value = list(value.keys())
        for scope in _unique_strings(value):
            if scope not in scopes:
                scopes.append(scope)
    items = proposal.get("items")
    if isinstance(items, list):
        for item in items:
            if isinstance(item, dict):
                for scope in _unique_strings(item.get("scope")):
                    if scope not in scopes:
                        scopes.append(scope)
    return sorted(scopes)


def _window(value: Any) -> list[str | None] | None:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        return None
    if all(item is None or isinstance(item, str) for item in value):
        return [value[0], value[1]]
    return None


def _evidence_summary(proposal: dict[str, Any], names: list[str]) -> dict[str, Any]:
    """Keep only counts/windows/source labels from report-like input."""
    source = proposal.get("evidence")
    if not isinstance(source, dict):
        source = proposal.get("report") if isinstance(proposal.get("report"), dict) else proposal
    result: dict[str, Any] = {}

    summary = source.get("summary") if isinstance(source, dict) else None
    if isinstance(summary, dict):
        counts = {key: value for key, value in summary.items() if isinstance(value, int) and not isinstance(value, bool)}
        if counts:
            result["counts"] = counts

    sources = source.get("sources") if isinstance(source, dict) else None
    if isinstance(sources, dict):
        source_summary: dict[str, Any] = {}
        for name, info in sources.items():
            if not isinstance(name, str):
                continue
            if isinstance(info, dict):
                row: dict[str, Any] = {}
                if isinstance(info.get("records"), int) and not isinstance(info.get("records"), bool):
                    row["records"] = info["records"]
                window = _window(info.get("window"))
                if window is not None:
                    row["window"] = window
                if row:
                    source_summary[name] = row
            elif isinstance(info, int) and not isinstance(info, bool):
                source_summary[name] = {"records": info}
        if source_summary:
            result["sources"] = source_summary

    tracking = source.get("tracking_started_at") if isinstance(source, dict) else None
    scanned = source.get("scanned_at") if isinstance(source, dict) else None
    if isinstance(tracking, str) or isinstance(scanned, str):
        result["window"] = {"tracking_started_at": tracking if isinstance(tracking, str) else None, "scanned_at": scanned if isinstance(scanned, str) else None}

    per_skill: dict[str, Any] = {}
    skill_rows = source.get("skills") if isinstance(source, dict) else None
    if isinstance(skill_rows, dict):
        iterable = ((name, row) for name, row in skill_rows.items())
    elif isinstance(skill_rows, list):
        iterable = ((row.get("name"), row) for row in skill_rows if isinstance(row, dict))
    else:
        iterable = ()
    for name, row in iterable:
        if name not in names or not isinstance(row, dict):
            continue
        entry: dict[str, Any] = {}
        if isinstance(row.get("count"), int) and not isinstance(row.get("count"), bool):
            entry["count"] = row["count"]
        first = row.get("first_used_at")
        last = row.get("last_used_at")
        if isinstance(first, str) or isinstance(last, str):
            entry["window"] = [first if isinstance(first, str) else None, last if isinstance(last, str) else None]
        by_source = row.get("by_source")
        if isinstance(by_source, dict):
            entry["sources"] = {key: value for key, value in by_source.items() if isinstance(key, str) and isinstance(value, int) and not isinstance(value, bool)}
        if entry:
            per_skill[name] = entry
    if per_skill:
        result["skills"] = per_skill
    return result


def _review_payload(proposal: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    names = _extract_names(proposal)
    scopes = _extract_scopes(proposal)
    evidence = _evidence_summary(proposal, names)
    payload: dict[str, Any] = {"skills": names, "scopes": scopes, "evidence": evidence}
    task = (
        "Review this unused-skill removal proposal. "
        f"Skills: {', '.join(names) if names else '(none)'}. "
        f"Scopes: {', '.join(scopes) if scopes else '(unspecified)'}. "
        "Assess whether the requested quarantine or retirement is safe using only the supplied usage counts, windows, and sources."
    )
    return task, payload


def _backend_record(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if not isinstance(value, dict):
        return None
    kind = value.get("kind")
    model = value.get("model")
    tier = value.get("tier")
    if not isinstance(kind, str) or not isinstance(tier, str):
        return None
    return {"kind": kind, "model": model if isinstance(model, str) else None, "tier": tier}


def review_removal(proposal: dict[str, Any], *, profile: str, allow_remote: bool, timeout: float = 60.0) -> dict[str, Any]:
    """Ask Jev to review a sanitized removal proposal; backend failures fail closed."""
    if not isinstance(proposal, dict) or not isinstance(profile, str) or not profile:
        return {"status": "unavailable", "receipt": None, "backend": None, "reason": "invalid review input"}
    names = _extract_names(proposal)
    if not names:
        return {"status": "unavailable", "receipt": None, "backend": None, "reason": "review proposal has no skill names"}
    if not allow_remote:
        # Consent precedes every harness call: even `status` probes configured endpoints,
        # which may be remote, so nothing runs until the caller approves backend access.
        return {"status": "unavailable", "receipt": None, "backend": None,
                "reason": "Jev review requires --allow-remote (approves sending the proposal to the profile's backend)"}

    task, safe_proposal = _review_payload(proposal)
    proposal_json = json.dumps(safe_proposal, ensure_ascii=False, separators=(",", ":"))
    code, stdout, _stderr, failure = _run(("--profile", profile, "review", task, proposal_json), timeout=timeout, env=os.environ.copy())
    if failure:
        return {"status": "unavailable", "receipt": None, "backend": None, "reason": failure}
    if code != 0:
        return {"status": "unavailable", "receipt": None, "backend": None, "reason": f"review exited with status {code}"}
    result = _json_output(stdout)
    if not isinstance(result, dict):
        return {"status": "unavailable", "receipt": None, "backend": None, "reason": "malformed review response"}
    verdict = result.get("verdict")
    if verdict == "reject":
        verdict = "deny"
    if verdict not in {"permit", "proposal_only", "deny", "unavailable"}:
        return {"status": "unavailable", "receipt": None, "backend": None, "reason": "malformed review verdict"}
    backend = _backend_record(result.get("backend"))
    if result.get("backend") is not None and backend is None:
        return {"status": "unavailable", "receipt": None, "backend": None, "reason": "malformed review backend"}
    receipt = result.get("receipt")
    if receipt is not None and (not isinstance(receipt, str) or not receipt):
        return {"status": "unavailable", "receipt": None, "backend": backend, "reason": "malformed review receipt"}
    reason = result.get("reason") if isinstance(result.get("reason"), str) else verdict
    if verdict == "unavailable":
        return {"status": "unavailable", "receipt": receipt, "backend": backend, "reason": reason}
    if backend is None:
        return {"status": "unavailable", "receipt": None, "backend": None, "reason": "malformed review backend"}
    if verdict in {"permit", "proposal_only"} and (result.get("receiptVersion") != 2 or not isinstance(receipt, str) or not re.fullmatch(r"[0-9a-f]{64}", receipt)):
        return {"status": "unavailable", "receipt": None, "backend": backend, "reason": "malformed review receipt"}
    record = {"status": verdict, "receipt": receipt, "backend": backend, "reason": reason}
    if verdict == "proposal_only":
        record["note"] = "human --apply approval"
    return record


def review_gate(proposal: dict[str, Any], *, profile: str | None, allow_remote: bool, skip: bool) -> dict[str, Any]:
    """Apply the fail-closed Jev review gate used by mutating commands."""
    if skip:
        return {"status": "skipped", "receipt": None, "backend": None, "reason": "jev review skipped"}
    if not profile:
        raise JevGateError("Jev review requires --jev-profile or --skip-jev-review")
    result = review_removal(proposal, profile=profile, allow_remote=allow_remote)
    if result.get("status") in {"deny", "unavailable"}:
        raise JevGateError(str(result.get("reason") or "Jev review did not authorize the proposal"))
    if result.get("status") not in {"permit", "proposal_only"}:
        raise JevGateError("Jev review returned an unusable status")
    return result


def _safe_repo_summary(repo: Path) -> tuple[Path, str]:
    if not repo.is_dir():
        raise JevGateError(f"relevance repository is not a directory: {repo}")
    root = repo.resolve()
    chunks: list[str] = []
    remaining = SUMMARY_LIMIT
    for filename in ("README.md", "AGENTS.md"):
        candidate = root / filename
        try:
            resolved = candidate.resolve()
        except OSError:
            continue
        if not resolved.is_file() or not resolved.is_relative_to(root) or remaining <= 0:
            continue
        try:
            with resolved.open("rb") as stream:
                raw = stream.read(remaining)
        except OSError:
            continue
        text = raw.decode("utf-8", errors="replace")
        label = f"## {filename}\n"
        part = (label + text).encode("utf-8")
        if len(part) > remaining:
            part = part[:remaining]
            text = part.decode("utf-8", errors="ignore")
        chunks.append(text if text.startswith("## ") else label + text)
        remaining -= len((chunks[-1]).encode("utf-8"))
    summary = "\n".join(chunks)
    encoded = summary.encode("utf-8")[:SUMMARY_LIMIT]
    return root, encoded.decode("utf-8", errors="ignore")


def _restricted_catalog(catalog: dict[str, Any], candidates: list[str]) -> dict[str, Any]:
    by_name = {item.get("name"): item for item in catalog.get("skills", []) if isinstance(item, dict) and isinstance(item.get("name"), str)}
    skills: list[dict[str, Any]] = []
    categories: dict[str, list[str]] = {}
    for name in candidates:
        item = by_name.get(name)
        if not item:
            continue
        skill = {key: item[key] for key in ("name", "category", "description", "path", "tags", "keyword") if key in item}
        if not all(isinstance(skill.get(key), str) and skill[key] for key in ("name", "category", "description")):
            continue
        skills.append(skill)
        categories.setdefault(skill["category"], []).append(name)
    return {"version": catalog.get("version", 1), "skills": skills, "categories": categories}


def relevance(candidates: list[str], catalog: dict[str, Any], repos: list[Path], *, profile: str, allow_remote: bool, top_k: int = 3, dry_run: bool) -> dict[str, Any]:
    if not isinstance(candidates, list) or not candidates:
        raise JevGateError("relevance requires at least one candidate skill")
    candidate_names = list(dict.fromkeys(name for name in candidates if isinstance(name, str) and name))
    if len(candidate_names) != len(candidates):
        raise JevGateError("relevance candidates must be non-empty skill names")
    if not repos:
        raise JevGateError("relevance requires at least one repository")
    normalized = [_safe_repo_summary(Path(repo)) for repo in repos]
    restricted = _restricted_catalog(catalog, candidate_names)
    allowed_names = {item["name"] for item in restricted["skills"]}
    if allowed_names != set(candidate_names):
        raise JevGateError("relevance candidate is missing from the catalog")
    payload_sizes = {str(root): len(summary.encode("utf-8")) for root, summary in normalized}
    if dry_run:
        return {"version": 1, "dry_run": True, "repos": [str(root) for root, _summary in normalized], "payload_bytes": payload_sizes}

    if not allow_remote:
        raise JevGateError("Jev relevance requires --allow-remote (approves sending repository summaries to the profile's backend)")

    protected: dict[str, dict[str, Any]] = {}
    backend: dict[str, Any] | None = None
    completed_routes = 0
    with tempfile.TemporaryDirectory(prefix="jeo-skill-jev-") as temporary:
        catalog_path = Path(temporary) / "skills.json"
        catalog_path.write_text(json.dumps(restricted, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        env = os.environ.copy()
        env["JEV_CATALOG_PATH"] = str(catalog_path)
        for root, summary in normalized:
            task = summary or "Repository summary unavailable: no readable README.md or AGENTS.md."
            code, stdout, _stderr, failure = _run(("--profile", profile, "route-skills", "--top-k", str(top_k), task), timeout=60.0, env=env)
            if failure:
                raise JevGateError(f"relevance route {failure}")
            if code != 0:
                raise JevGateError(f"relevance route exited with status {code}")
            result = _json_output(stdout)
            if not isinstance(result, dict) or not isinstance(result.get("topK"), list):
                raise JevGateError("malformed relevance response")
            result_backend = _backend_record(result.get("backend"))
            if result_backend is None:
                raise JevGateError("malformed relevance backend")
            backend = backend or result_backend
            for item in result["topK"]:
                if not isinstance(item, dict) or not isinstance(item.get("name"), str) or item["name"] not in allowed_names:
                    raise JevGateError("malformed relevance ranking")
                score = item.get("fits")
                if not isinstance(score, (int, float)) or isinstance(score, bool) or not math.isfinite(float(score)) or not 0 <= float(score) <= 1:
                    raise JevGateError("malformed relevance score")
                if score >= FIT_THRESHOLD:
                    previous = protected.get(item["name"])
                    if previous is None or score > previous["score"]:
                        protected[item["name"]] = {"score": float(score), "repo": str(root)}
            completed_routes += 1
    if completed_routes == 0 or backend is None:
        raise JevGateError("relevance produced no valid route")

    try:
        from skill_usage import iso, now, write_state
    except ImportError as error:
        raise JevGateError("skill_usage module is unavailable") from error
    generated_at = iso(now())
    data = {"version": 1, "generated_at": generated_at, "backend": backend, "repos": [str(root) for root, _summary in normalized], "protect": protected}
    write_state("relevance.json", data)
    return data
