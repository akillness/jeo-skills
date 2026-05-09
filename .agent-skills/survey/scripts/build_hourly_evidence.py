#!/usr/bin/env python3
import json
import os
import subprocess
from datetime import datetime, timezone

LANE_TOKENS = {
    "agentic-ai-skill": ["agentic", "agent", "ai", "llm", "autonomous"],
    "web-frontend-skill": ["frontend", "front-end", "react", "vue", "svelte", "ui"],
    "web-backend-skill": ["backend", "back-end", "api", "server", "django", "fastapi", "node"],
    "cli-open-source-skill": ["cli", "command line", "terminal", "shell"],
    "game-development-skill": ["game", "gamedev", "unity", "unreal", "godot"],
}

NEGATIONS = ["no cli", "without cli", "not a cli", "non-cli"]
GENERIC_REPO_WORDS = ["portfolio", "protfolio", "homework", "assignment", "demo"]


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    return p.returncode, p.stdout, p.stderr


def gh_search(query, limit=30):
    cmd = [
        "gh", "search", "repos", query,
        "--limit", str(limit),
        "--json", "fullName,description,url,updatedAt,pushedAt,isArchived,license,stargazersCount"
    ]
    code, out, err = run(cmd)
    if code != 0:
        return {"ok": False, "error": err.strip(), "items": []}
    try:
        return {"ok": True, "items": json.loads(out)}
    except Exception as e:
        return {"ok": False, "error": str(e), "items": []}


def parse_dt(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def license_id(lic):
    if not isinstance(lic, dict):
        return None
    return lic.get("spdx_id") or lic.get("spdxId") or lic.get("key") or lic.get("name")


def enrich_license(full_name):
    code, out, _ = run(["gh", "repo", "view", full_name, "--json", "licenseInfo"])
    if code == 0:
        try:
            d = json.loads(out)
            li = d.get("licenseInfo") or {}
            if isinstance(li, dict):
                return li.get("spdxId") or li.get("name")
        except Exception:
            pass
    code, out, _ = run(["gh", "api", "repos/{}".format(full_name), "--jq", ".license.spdx_id"])
    if code == 0:
        v = out.strip()
        return v if v and v != "null" else None
    return None


def has_lane_token(text, lane):
    t = (text or "").lower()
    return any(tok in t for tok in LANE_TOKENS[lane])


def negated_only(text):
    t = (text or "").lower()
    return any(n in t for n in NEGATIONS)


def generic_personal(text):
    t = (text or "").lower()
    return any(w in t for w in GENERIC_REPO_WORDS)


def keep_reason(item, lane):
    name = item.get("fullName", "")
    desc = item.get("description") or ""
    merged = (name + " " + desc).lower()
    stars = int(item.get("stargazersCount") or 0)
    if item.get("isArchived"):
        return False, "archived"
    if negated_only(merged):
        return False, "low-fit"
    if not has_lane_token(merged, lane):
        return False, "low-fit"
    if generic_personal(merged):
        return False, "low-fit"
    lic = license_id(item.get("license"))
    if not lic:
        lic = enrich_license(name)
    if not lic:
        return False, "license"
    pushed = parse_dt(item.get("pushedAt")) or parse_dt(item.get("updatedAt"))
    if not pushed:
        return False, "stale"
    age_months = (datetime.now(timezone.utc) - pushed).days / 30.44
    if age_months > 24:
        return False, "stale"
    if stars < 3:
        return False, "low-signal"
    item["normalized_license"] = lic
    item["fit_rationale"] = "token+signal+freshness satisfied"
    return True, "pass"


def main():
    slug = os.environ["SLUG"]
    qpath = ".survey/{}/lane-queries.json".format(slug)
    queries = json.load(open(qpath))["lanes"]
    evidence = {
        "slug": slug,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "lanes": {},
        "provenance_labels": ["indexed snippet", "direct page retrieval"],
    }
    candidates = []
    for lane, qset in queries.items():
        stage_queries = [qset["stage-0"], qset["stage-1"], qset["stage-2"]]
        selected = []
        recovery_queries = []
        raw = []
        selected_stage = None
        for i, q in enumerate(stage_queries):
            res = gh_search(q)
            count = len(res.get("items", []))
            recovery_queries.append({"stage": "stage-{}".format(i), "query": q, "attempted": True, "result_count": count, "ok": res.get("ok", False), "error": res.get("error")})
            if selected_stage is None and res.get("ok") and count > 0:
                raw = res["items"]
                selected_stage = i
        dedup = {}
        for r in raw:
            dedup[r.get("fullName")] = r
        raw = list(dedup.values())
        rejects = []
        causes = {}
        for item in raw:
            ok, reason = keep_reason(item, lane)
            if ok:
                selected.append(item)
                row = {"lane": lane}
                for kk, vv in item.items():
                    row[kk] = vv
                candidates.append(row)
            else:
                rejects.append({"fullName": item.get("fullName"), "reason": reason, "url": item.get("url")})
                causes[reason] = causes.get(reason, 0) + 1
        stars = sorted([int(x.get("stargazersCount") or 0) for x in raw])
        median = stars[len(stars)//2] if stars else 0
        lane_status = "pass" if len(raw) > 0 and len(selected) > 0 else "degraded"
        degraded_causes = []
        if lane_status == "degraded":
            if len(raw) == 0:
                degraded_causes = ["no-results"]
            else:
                degraded_causes = sorted(causes.keys())[:3] if causes else ["low-fit"]
        evidence["lanes"][lane] = {
            "lane_status": lane_status,
            "degraded_causes": degraded_causes,
            "raw_count": len(raw),
            "kept_count": len(selected),
            "zero_star_raw": sum(1 for x in raw if int(x.get("stargazersCount") or 0) == 0),
            "median_stars_raw": median,
            "recovery_queries": recovery_queries,
            "raw_examples": [{"fullName": x.get("fullName"), "url": x.get("url"), "description": x.get("description"), "stars": x.get("stargazersCount",0)} for x in raw[:8]],
            "kept": [{"fullName": x.get("fullName"), "url": x.get("url"), "stars": x.get("stargazersCount",0), "license": x.get("normalized_license"), "pushedAt": x.get("pushedAt"), "fit_rationale": x.get("fit_rationale")} for x in selected[:5]],
            "filtered_examples": rejects[:5],
            "provenance": "indexed snippet"
        }
    recommended_lane_count = sum(1 for _, v in evidence["lanes"].items() if v["kept_count"] > 0)
    evidence["recommended_lane_count"] = recommended_lane_count
    evidence["single_lane_concentration"] = recommended_lane_count < 2
    op = ".survey/{}/evidence.json".format(slug)
    with open(op, "w") as f:
        json.dump(evidence, f, indent=2)
    with open(".survey/{}/candidates.json".format(slug), "w") as f:
        json.dump(candidates, f, indent=2)

if __name__ == "__main__":
    main()
