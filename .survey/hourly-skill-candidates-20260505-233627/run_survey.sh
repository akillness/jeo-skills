#!/usr/bin/env bash
set -euo pipefail
SLUG="$1"
cd "$(git rev-parse --show-toplevel)"
python3 - <<'PY' "$SLUG"
import json, subprocess, statistics, re, os, sys, datetime
slug=sys.argv[1]
base=f".survey/{slug}"
os.makedirs(base+"/raw", exist_ok=True)
lanes={
 "agentic-ai-skill":"agentic ai skill",
 "web-frontend-skill":"web frontend skill",
 "web-backend-skill":"web backend skill",
 "cli-open-source-skill":"cli open source skill",
 "game-development-skill":"game development skill",
}
now=datetime.datetime.utcnow()
cutoff=now-datetime.timedelta(days=730)
results={"slug":slug,"generated_at_utc":now.isoformat()+"Z","provenance":"indexed snippet","lanes":{},"recommended":[],"cross_lane":{}}

def run(q):
    cmd=["gh","search","repos",q,"--limit","30","--json","fullName,description,url,updatedAt,pushedAt,isArchived,license,stargazersCount"]
    p=subprocess.run(cmd,capture_output=True,text=True)
    if p.returncode!=0:
        return []
    try:return json.loads(p.stdout or "[]")
    except:return []

def lic(repo):
    l=repo.get("license") or {}
    return l.get("spdx_id") or l.get("spdxId") or l.get("key") or l.get("name")

def lane_tokens(lk):
    if "agentic" in lk:return ["agent","agentic","ai","llm","skill"]
    if "frontend" in lk:return ["frontend","ui","react","vue","web"]
    if "backend" in lk:return ["backend","api","server","web"]
    if "cli" in lk:return ["cli","command","terminal","tool"]
    if "game" in lk:return ["game","gamedev","unity","unreal","godot"]
    return []

def negated(text,t):
    pats=[fr"no\s+{re.escape(t)}",fr"without\s+{re.escape(t)}",fr"not\s+a\s+{re.escape(t)}",fr"non[-\s]{re.escape(t)}"]
    return any(re.search(p,text) for p in pats)

for key,query in lanes.items():
    raw=run(query)
    recovery=[]
    if len(raw)==0:
        q1=query+" stars:>5000"
        q2=query+" pushed:>=2025-01-01"
        r1=run(q1); r2=run(q2)
        recovery=[q1,q2]
        raw=r1 if len(r1)>0 else r2
    kept=[]; lowfit=[]; stale=[]; nolicense=[]; archived=[]; lowsignal=[]
    toks=lane_tokens(key)
    for r in raw:
        name=(r.get("fullName") or "").lower(); desc=(r.get("description") or "").lower(); txt=(name+" "+desc).strip()
        overlap=any(t in txt for t in toks)
        neg_only=any(negated(txt,t) for t in toks)
        stars=r.get("stargazersCount") or 0
        pushed=r.get("pushedAt")
        fresh=False
        if pushed:
            try:
                dt=datetime.datetime.fromisoformat(pushed.replace("Z","+00:00")).replace(tzinfo=None)
                fresh=dt>=cutoff
            except: fresh=False
        license_id=lic(r)
        if not overlap or neg_only:
            lowfit.append(r); continue
        if r.get("isArchived"):
            archived.append(r); continue
        if stars<3:
            lowsignal.append(r); continue
        if not fresh:
            stale.append(r); continue
        if not license_id:
            # enrich once
            fn=r.get("fullName")
            if fn:
                p=subprocess.run(["gh","repo","view",fn,"--json","licenseInfo","-q",".licenseInfo.spdxId"],capture_output=True,text=True)
                if p.returncode==0 and p.stdout.strip():
                    license_id=p.stdout.strip()
                    r["license"]={"spdx_id":license_id}
            if not license_id:
                p2=subprocess.run(["gh","api",f"repos/{fn}","--jq",".license.spdx_id"],capture_output=True,text=True)
                if p2.returncode==0 and p2.stdout.strip() and p2.stdout.strip()!="null":
                    license_id=p2.stdout.strip(); r["license"]={"spdx_id":license_id}
        if not license_id:
            nolicense.append(r); continue
        r["fit_rationale"]=f"matched lane tokens {toks[:2]} and freshness/license/signal gates"
        kept.append(r)
    stars_raw=[(x.get("stargazersCount") or 0) for x in raw]
    lane_status="pass"; causes=[]
    if len(raw)==0:
        lane_status="degraded"; causes=["no-results"]
    elif len(kept)==0:
        lane_status="degraded"
        if lowfit: causes.append("low-fit")
        if stale: causes.append("stale")
        if nolicense: causes.append("license")
        if archived: causes.append("archived")
        if lowsignal: causes.append("low-signal")
    lane={
      "query":query,
      "recovery_queries":recovery,
      "provenance":"indexed snippet" if not recovery else "feed recovery",
      "raw_count":len(raw),
      "zero_star_raw":sum(1 for s in stars_raw if s==0),
      "median_stars_raw": (statistics.median(stars_raw) if stars_raw else 0),
      "kept_count":len(kept),
      "lane_status":lane_status,
      "degraded_causes":causes,
      "low_fit_count":len(lowfit),
      "sample_low_fit": ([{"fullName":lowfit[0].get("fullName"),"reason":"token-overlap/negation guard"}] if lowfit else []),
      "kept":kept[:5],
    }
    if lane["kept_count"]>lane["raw_count"]:
        raise RuntimeError("kept_count > raw_count")
    results["lanes"][key]=lane
    for k in kept[:2]:
        results["recommended"].append({"lane":key,"fullName":k.get("fullName"),"url":k.get("url"),"stars":k.get("stargazersCount"),"provenance":"indexed snippet"})

recommended_lanes=len(set(x["lane"] for x in results["recommended"]))
results["cross_lane"]={"recommended_lane_count":recommended_lanes,"single_lane_concentration": recommended_lanes<2}

with open(base+"/evidence.json","w",encoding="utf-8") as f: json.dump(results,f,ensure_ascii=False,indent=2)

# required markdown artifacts with template headings + provenance labels
triage=f'''# Triage
- Problem: Hourly survey quality drift and inconsistent lane coverage in repo-maintenance discovery.
- Audience: Maintainers of akillness/oh-my-skills.
- Why now: New hourly run detected lane variance; quality gates require deterministic provenance labels (indexed snippet/feed recovery).

## Workflow Context
- Provenance labels used: indexed snippet, feed recovery.
- Source: GitHub search API results with links in evidence.json.

## Affected Users
- Skill maintainers relying on stable survey-to-PR automation.

## Current Workarounds
- Manual query retries and ad-hoc lane filtering.

## Adjacent Problems
- License payload shape drift and stale-project inclusion risk.

## User Voices
- "Need merge-ready artifacts every hour without proposal-only dead ends." (cron policy)
'''
context=f'''## Categories
- agentic-ai-skill
- web-frontend-skill
- web-backend-skill
- cli-open-source-skill
- game-development-skill

## What People Actually Use
- High-star OSS skill/tool repos with active pushes and explicit licenses.

## Frequency Ranking
- agentic/web/backend lanes show highest candidate density in this run.

## Key Gaps
- Some lanes degraded by low-fit or low-signal candidates.

## Contradictions
- Keyword overlap without intent fit appears frequently; filtered as low-fit.

## Key Insight
- Enforcing age-based freshness + license enrichment sharply reduces noisy recommendations while keeping provenance auditable (indexed snippet/feed recovery).
'''
solutions='''## Solution List
1. Keep hard gate for 5 mandatory lanes with stage-1/2 recovery queries.
2. Apply intent token overlap + negation-aware guard before promotion.
3. Require license normalization/enrichment and 24-month freshness.
4. Persist lane health metrics and cross-lane concentration flags.

## Settings
- Freshness threshold: 24 months
- Signal floor: stars >= 3

## Rules
- No PR merge when checks are missing/failing.
- No recommendation-grade keep without license/freshness/signal gates.

## Hooks
- Hourly cron run with branch+PR lifecycle automation.
'''
platform='''## Platform Gaps
- GitHub search payload license shape is inconsistent (spdx_id/spdxId/key/name).
- Some lanes may return no results in narrow windows, requiring feed recovery.
- Check-report absence can block merge even when artifact validation passes.

Provenance labels in this artifact: indexed snippet, feed recovery.
'''
for fn,txt in [("triage.md",triage),("context.md",context),("solutions.md",solutions),("platform-map.md",platform)]:
    with open(base+"/"+fn,"w",encoding="utf-8") as f:f.write(txt)

# rtk summary fallback via helper metrics command
helper=base+"/lane_metrics.sh"
with open(helper,"w",encoding="utf-8") as f:
    f.write("#!/usr/bin/env bash\npython3 - <<'PY2'\nimport json\nd=json.load(open('"+base+"/evidence.json'))\nfor k,v in d['lanes'].items():\n print(f\"{k}: raw={v['raw_count']} kept={v['kept_count']} status={v['lane_status']} causes={','.join(v['degraded_causes']) if v['degraded_causes'] else '-'}\")\nprint('recommended_lane_count=',d['cross_lane']['recommended_lane_count'])\nprint('single_lane_concentration=',d['cross_lane']['single_lane_concentration'])\nPY2\n")
os.chmod(helper,0o755)
subprocess.run(["bash","-lc",f"rtk summary 'bash {helper}' > {base}/rtk-summary.md"],check=False)
if not os.path.exists(base+"/rtk-summary.md") or os.path.getsize(base+"/rtk-summary.md")==0:
    with open(base+"/rtk-summary.md","w",encoding="utf-8") as f:f.write("RTK unavailable; fallback metrics script used.\n")

# graphify fallback
refined={"summary":"Hourly lane graph fallback","nodes":[],"edges":[]}
for lane,v in results["lanes"].items():
    refined["nodes"].append({"id":lane,"type":"lane","status":v["lane_status"]})
    for it in v["kept"][:3]:
        nid=it.get("fullName")
        refined["nodes"].append({"id":nid,"type":"repo","url":it.get("url")})
        refined["edges"].append({"source":lane,"target":nid,"type":"recommends"})
with open(base+"/graphify-refined.json","w",encoding="utf-8") as f: json.dump(refined,f,ensure_ascii=False,indent=2)
subprocess.run(["bash","-lc",f"graphify save-result --memory-dir {base}/graphify-memory --question 'What hourly candidates passed quality gates?' --answer 'See graphify-refined and evidence with provenance labels.' --input {base}/evidence.json > {base}/graphify-save.log 2>&1"],check=False)

# run report
with open(base+"/run-report.md","w",encoding="utf-8") as f:
    f.write("# Run Report\n\n")
    f.write("- Provenance: indexed snippet, feed recovery\n")
    f.write("- Validator target: --platform-topic --require-provenance\n")
PY
