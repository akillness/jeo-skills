#!/usr/bin/env python3
"""Deterministic lane scorer for hourly survey runs.

Input JSON schema (stdin/file):
{
  "lane": "web-frontend-skill",
  "tokens": ["frontend", "react"],
  "repos": [
    {
      "fullName": "owner/name",
      "description": "...",
      "url": "https://github.com/owner/name",
      "pushedAt": "2026-01-01T00:00:00Z",
      "isArchived": false,
      "stargazersCount": 10,
      "license": {"spdx_id": "MIT"}
    }
  ]
}
"""
import argparse
import json
import re
import statistics
from datetime import datetime, timezone

NEG_RE = re.compile(r"(no|without|not a|non[- ]?)\s*(cli|frontend|backend|game|agentic|ai)", re.I)
GENERIC_RE = re.compile(r"portfolio|protfolio|homework|assignment|demo", re.I)


def normalize_license(repo):
    lic = repo.get("license") or {}
    if isinstance(lic, str):
        return lic
    for k in ("spdx_id", "spdxId", "key", "name"):
        v = lic.get(k)
        if v:
            return v
    return None


def age_fresh(pushed_at, months=24):
    if not pushed_at:
        return False
    try:
        dt = datetime.fromisoformat(pushed_at.replace("Z", "+00:00"))
    except Exception:
        return False
    now = datetime.now(timezone.utc)
    return (now - dt).days <= int(months * 30.5)


def score_lane(lane, tokens, repos):
    kept = []
    low_fit_examples = []
    stars = []

    for repo in repos:
        name = repo.get("fullName") or ""
        desc = repo.get("description") or ""
        txt = (name + " " + desc).lower()

        token_hit = any(t.lower() in txt for t in tokens)
        negation_only = bool(NEG_RE.search(txt))
        generic = bool(GENERIC_RE.search(txt))
        archived = bool(repo.get("isArchived"))
        stars_count = int(repo.get("stargazersCount") or 0)
        stars.append(stars_count)
        license_id = normalize_license(repo)
        fresh = age_fresh(repo.get("pushedAt"), months=24)
        signal = stars_count >= 3

        fit = token_hit and (not negation_only) and (not generic)
        keep = fit and signal and fresh and (not archived) and (license_id is not None)

        if keep:
            kept.append({
                "fullName": name,
                "url": repo.get("url"),
                "stars": stars_count,
                "license": license_id,
                "pushed_at": repo.get("pushedAt"),
                "fit_rationale": "token-overlap+non-negated+non-generic+fresh+signal+licensed",
            })
        elif len(low_fit_examples) < 5:
            reasons = []
            if not token_hit:
                reasons.append("token-miss")
            if negation_only:
                reasons.append("negation")
            if generic:
                reasons.append("generic")
            if not signal:
                reasons.append("low-signal")
            if not fresh:
                reasons.append("stale")
            if archived:
                reasons.append("archived")
            if license_id is None:
                reasons.append("license")
            low_fit_examples.append({
                "fullName": name,
                "url": repo.get("url"),
                "reason": ",".join(reasons) or "unspecified",
            })

    raw_count = len(repos)
    zero_star_raw = sum(1 for s in stars if s == 0)
    median_stars_raw = statistics.median(stars) if stars else 0
    kept_count = len(kept)

    degraded_causes = []
    if raw_count == 0:
        degraded_causes.append("no-results")
    elif kept_count == 0:
        reason_pool = ",".join(x.get("reason", "") for x in low_fit_examples)
        for cause in ("license", "stale", "low-fit", "archived", "low-signal"):
            if cause in reason_pool or (cause == "low-fit" and ("token-miss" in reason_pool or "generic" in reason_pool or "negation" in reason_pool)):
                degraded_causes.append(cause)
        if not degraded_causes:
            degraded_causes.append("low-signal")

    lane_status = "pass" if kept_count > 0 else "degraded"

    if kept_count > raw_count:
        raise ValueError("metric integrity failure: kept_count > raw_count")

    return {
        "lane": lane,
        "raw_count": raw_count,
        "zero_star_raw": zero_star_raw,
        "median_stars_raw": median_stars_raw,
        "kept_count": kept_count,
        "lane_status": lane_status,
        "degraded_causes": degraded_causes,
        "recommended": kept,
        "low_fit_examples": low_fit_examples,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="JSON input file")
    ap.add_argument("--output", required=True, help="JSON output file")
    args = ap.parse_args()

    with open(args.input) as f:
        payload = json.load(f)

    result = score_lane(payload.get("lane", "unknown"), payload.get("tokens", []), payload.get("repos", []))

    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)


if __name__ == "__main__":
    main()
