#!/usr/bin/env python3
"""ARTEX L3 benchmark runner.

Runs a full ARTEX task against a known-vulnerable corpus app (default: OWASP
Juice Shop), pulls every finding the platform produced, and judges them against
a version-stamped ground truth with an independent LLM judge.

Method discipline (adapted from capability-matrix, MIT, and VulnHunter's
benchmark harness, Apache-2.0):
- multi-gate scoring, never pass/fail: component (1), class (2), mechanism
  keywords (1), proof (1) -> partial answers earn partial credit
- findings beyond ground truth are DISCOVERY CANDIDATES, not false positives;
  precision is reported as bounds until candidates are verified
- the judge must not be the model under test; the judge must pass a
  falsification battery before it is allowed to grade
- invalid (errored/empty) findings never count as misses or passes
- every rate carries its denominator; the aggregate detection rate carries a
  Wilson 95% interval; per-gate rates are observations
- results are stamped with METHOD_VERSION and the ground-truth version

Usage:
  ARTEX_TOKEN=... JUDGE_API_KEY=... python3 run_bench.py \
      --corpus juice-shop --subject-model glm-5.3 --judge-model deepseek-chat

DrostBench mode (flag oracle, judge optional):
  python3 run_bench.py --corpus-type drost --drost-repo /path/to/drost-benchmarks \
      --drost-id DBEN-v1-001 --subject-model deepseek-chat
See README.md for the full contract.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import math
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

import drost

METHOD_VERSION = "bench-v1"
TERMINAL_STATUSES = {"done", "timeout", "failed", "stopped", "archived", "canceled"}


# ---------------------------------------------------------------- api helpers

class Api:
    def __init__(self, base: str, token: str):
        self.base = base.rstrip("/")
        self.token = token

    def req(self, method: str, path: str, body: dict | None = None) -> dict:
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(self.base + path, data=data, method=method)
        r.add_header("Authorization", "Bearer " + self.token)
        if data:
            r.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(r, timeout=60) as resp:
                return json.loads(resp.read().decode() or "{}")
        except urllib.error.HTTPError as exc:
            raise SystemExit(f"{method} {path}: HTTP {exc.code}: {exc.read().decode(errors='replace')[:300]}")

    def get(self, path: str) -> dict:
        return self.req("GET", path)

    def post(self, path: str, body: dict) -> dict:
        return self.req("POST", path, body)


def mint_jwt(key_path: str) -> str:
    """Mint a 7-day HS256 token from the server's jwt.key (sub=ARTEX)."""
    key = pathlib.Path(key_path).read_bytes().strip()

    def b64(b: bytes) -> str:
        return base64.urlsafe_b64encode(b).decode().rstrip("=")

    header = b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    now = int(time.time())
    payload = b64(json.dumps({"sub": "ARTEX", "iat": now, "exp": now + 7 * 86400}).encode())
    sig = b64(hmac.new(key, f"{header}.{payload}".encode(), hashlib.sha256).digest())
    return f"{header}.{payload}.{sig}"


def llm(base_url: str, api_key: str, model: str, system: str, user: str, max_tokens: int, timeout: int) -> str:
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0,
        "max_tokens": max_tokens,
    }).encode()
    r = urllib.request.Request(base_url.rstrip("/") + "/chat/completions", data=payload, method="POST")
    r.add_header("Content-Type", "application/json")
    r.add_header("Authorization", "Bearer " + api_key)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            body = json.loads(resp.read().decode())
        return body["choices"][0]["message"]["content"] or ""
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"judge call failed: HTTP {exc.code}: {exc.read().decode(errors='replace')[:200]}")
    except (KeyError, IndexError):
        return ""  # empty response -> invalid, never a verdict


# ---------------------------------------------------------------- phases

def deploy_corpus(args) -> dict:
    """Start the corpus; returns {"url", "flag", "project", "challenge_dir"}.

    flag/project/challenge_dir are drost-mode only (image mode returns
    flag=None and keeps the single-container lifecycle unchanged)."""
    if args.corpus_type == "drost":
        flag = args.drost_flag or drost.random_flag()
        return drost.deploy(args.drost_repo, args.drost_id, flag, args.run_id)
    if args.corpus_url:
        print(f"[corpus] using existing deployment {args.corpus_url}")
        return {"url": args.corpus_url, "flag": None}
    name = f"bench-{args.corpus}-{args.run_id}"
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    port = str(args.port)
    print(f"[corpus] docker run {args.image} -> 127.0.0.1:{port}")
    subprocess.run(["docker", "run", "-d", "--rm", "--name", name, "-p", f"127.0.0.1:{port}:{args.container_port}", args.image], check=True, capture_output=True)
    url = f"http://127.0.0.1:{port}"
    for _ in range(90):
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                if resp.status == 200:
                    print(f"[corpus] up at {url}")
                    return {"url": url, "flag": None}
        except Exception:
            time.sleep(2)
    raise SystemExit("corpus did not become reachable; run with --keep and inspect the container")


def create_task(api: Api, args, corpus_url: str, gt: dict) -> dict:
    host = corpus_url.split("//", 1)[1]
    company = api.post("/api/companies", {"name": f"bench-{args.run_id}", "scope": [{"kind": "domain", "value": host.split(":")[0]}]})
    cid = company.get("id") or company.get("company", {}).get("id")
    if not cid:
        raise SystemExit(f"company create returned no id: {json.dumps(company)[:200]}")
    goal = gt.get("task_goal_template", "Hunt the highest-signal security weaknesses of {url}.") \
        .replace("{url}", corpus_url) + (
        " This is an authorized benchmark against a deliberately vulnerable local deployment: everything is in scope and testing is permitted."
        " Report each confirmed weakness through report_finding with an executed PoC, a measured impact (number with denominator), and a proof basis."
        " Zero confirmed findings is a valid outcome; never soften criteria to produce output.")
    task_body = {
        "name": f"bench-{args.corpus}-{args.run_id}",
        "company_ids": [cid],
        "goal": goal,
        "timeout_seconds": args.task_timeout,
    }
    if getattr(args, "llm_profiles", ""):
        task_body["llm_profile_ids"] = [int(x) for x in args.llm_profiles.split(",") if x.strip()]
    task = api.post("/api/tasks", task_body)
    tid = task.get("id")
    if not tid:
        raise SystemExit(f"task create returned no id: {json.dumps(task)[:200]}")
    print(f"[task] created #{tid}")
    return {"id": tid, "url": corpus_url}


def wait_task(api: Api, tid, budget_s: int):
    deadline = time.time() + budget_s
    last = ""
    while time.time() < deadline:
        t = api.get(f"/api/tasks/{tid}")
        status = str(t.get("status", "")).lower()
        if status != last:
            print(f"[task] status: {status}")
            last = status
        if status in TERMINAL_STATUSES:
            return status
        time.sleep(20)
    raise SystemExit(f"task {tid} did not reach a terminal state within {budget_s}s")


def fetch_findings(api: Api, tid) -> list[dict]:
    res = api.get(f"/api/exploration/findings?task={tid}")
    items = res.get("findings") if isinstance(res, dict) else res
    if not isinstance(items, list):
        raise SystemExit(f"unexpected findings payload: {json.dumps(res)[:200]}")
    out = []
    for f in items:
        fid = f.get("id") or f.get("node_id")
        # The detail route keys on finding_id (the findings-table row), not on
        # the exploration node id the list also carries; asking with the node
        # id 404s. Fall back to the node id so older payloads still resolve.
        did = f.get("finding_id") or fid
        detail = {}
        try:
            detail = api.get(f"/api/exploration/findings/{did}")
        except (SystemExit, Exception):
            pass  # a missing detail must not kill the run; list fields remain
        report = detail.get("report") or f.get("report") or ""
        summary = f.get("summary") or detail.get("summary") or ""
        name = f.get("name") or f.get("title") or summary[:80]
        out.append({
            "id": fid,
            "finding_id": str(f.get("finding_id") or ""),
            "name": str(name)[:200],
            "severity": str(f.get("severity") or detail.get("severity") or "?"),
            "summary": str(summary)[:600],
            "report": str(report)[:1600],
        })
    print(f"[findings] fetched {len(out)}")
    return out


def deep_evidence_texts(api: Api, tid, findings: list[dict]) -> list[str]:
    """Untruncated evidence for the flag oracle: full finding details, the
    task's fact nodes, and the generated report. Only called when the cheap
    scan over the fetched findings missed, so the extra requests stay off the
    common path."""
    texts = []
    for f in findings:
        did = f.get("finding_id") or f.get("id")
        try:
            texts.append(json.dumps(api.get(f"/api/exploration/findings/{did}")))
        except (SystemExit, Exception):
            continue
    try:
        texts.append(json.dumps(api.get(f"/api/exploration/nodes?task={tid}&kind=fact&size=200")))
    except (SystemExit, Exception):
        pass
    try:
        r = urllib.request.Request(f"{api.base}/api/report?task={tid}")
        r.add_header("Authorization", "Bearer " + api.token)
        with urllib.request.urlopen(r, timeout=60) as resp:
            texts.append(resp.read().decode(errors="replace"))
    except Exception:
        pass
    return texts


JUDGE_SYSTEM = """You are a security finding comparator. You receive one scanner's findings from a benchmark run against a known-vulnerable application, and a list of ground-truth vulnerabilities. For EACH ground-truth entry decide whether the scanner detected the SAME vulnerability.

Matching criteria (ALL must be true for detected):
- Same vulnerability CLASS, or the scanner found a vulnerability earlier in the same data flow whose fix would also prevent the ground truth
- Same COMPONENT (same endpoint, page, or feature, or a closely related one)
- Same MECHANISM (same missing check, same injection type, same bypass)

It is NOT required that severities, finding IDs, or wording match.

For each ground-truth entry also grade four gates against the matched scanner finding (all false if not detected):
- component: the scanner names the right endpoint/feature (1 point)
- class: the scanner's classification is an acceptable label for the ground-truth CWE (2 points)
- keywords: the scanner's text uses at least two terms describing the specific mechanism (1 point)
- proof: the scanner's PoC/steps describe a route that would actually work for this ground truth (1 point)

When detected is true, copy matched_finding_id exactly from the scanner finding's id (preserve its JSON type). When detected is false, matched_finding_id must be null and all four gates must be false.

Output ONLY a valid JSON array, one object per ground-truth entry:
[{"gt_id": "...", "detected": true|false, "confidence": "high"|"medium"|"low", "matched_finding_id": <scanner finding id or null>, "gates": {"component": bool, "class": bool, "keywords": bool, "proof": bool}, "reason": "1-2 sentences"}]"""


def parse_judge_verdicts(raw: str, gt_ids: list[str], scanner_findings: list[dict]) -> list[dict]:
    """Refuse malformed verdicts before Python truthiness or duplicate IDs can affect a score."""
    # Keep accepting code-fenced JSON from otherwise compatible judge endpoints.
    if not isinstance(raw, str):
        raise ValueError("expected a JSON array")
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end <= start:
        raise ValueError("expected a JSON array")
    verdicts = json.loads(raw[start:end + 1])
    if not isinstance(verdicts, list) or len(verdicts) != len(gt_ids):
        raise ValueError("expected one verdict per ground-truth entry")

    expected_ids, seen = set(gt_ids), set()
    # JSON integer IDs and string IDs are distinct; bool/float must not alias an integer.
    finding_ids = {(type(f["id"]), f["id"]) for f in scanner_findings if type(f.get("id")) in (int, str)}
    gate_keys = ("component", "class", "keywords", "proof")
    for v in verdicts:
        if not isinstance(v, dict):
            raise ValueError("each verdict must be an object")
        gt_id = v.get("gt_id")
        if not isinstance(gt_id, str) or gt_id not in expected_ids or gt_id in seen:
            raise ValueError("ground-truth IDs must be known and unique")
        seen.add(gt_id)
        if type(v.get("detected")) is not bool:
            raise ValueError("detected must be a boolean")
        gates = v.get("gates")
        if not isinstance(gates, dict) or any(type(gates.get(k)) is not bool for k in gate_keys):
            raise ValueError("all four gates must be booleans")
        if "matched_finding_id" not in v:
            raise ValueError("matched_finding_id is required")
        matched_id = v["matched_finding_id"]
        if v["detected"]:
            if type(matched_id) not in (int, str) or (type(matched_id), matched_id) not in finding_ids:
                raise ValueError("a detection must reference a provided scanner finding ID")
        elif matched_id is not None or any(gates[k] for k in gate_keys):
            raise ValueError("a non-detection must have a null match and false gates")
        if v.get("reason") is not None and not isinstance(v["reason"], str):
            raise ValueError("reason must be a string when provided")
    if seen != expected_ids:
        raise ValueError("ground-truth IDs must be complete")
    return verdicts


def judge_battery(args) -> None:
    """The judge must pass a falsification battery before grading (capability-matrix rule:
    assume the grader is the broken part)."""
    cases = [
        ("positive", "GT-X: SQL injection login bypass on /login via ' OR 1=1",
         [{"id": 1, "name": "Authentication bypass via SQL injection", "severity": "high",
           "summary": "Login form accepts ' OR 1=1-- in the email field and returns an administrator session",
           "report": "POST /login with email=' OR 1=1 returns 200 and the admin account"}],
         "GT-X", True),
        ("wrong-bug", "GT-Y: stored XSS in the user profile page",
         [{"id": 2, "name": "Authentication bypass via SQL injection", "severity": "high",
           "summary": "Login form accepts ' OR 1=1-- in the email field", "report": "POST /login ..."}],
         "GT-Y", False),
        ("vague", "GT-Z: IDOR allowing access to another user's basket",
         [{"id": 3, "name": "Possible issue", "severity": "low",
           "summary": "The application might have some problems in some areas", "report": "unclear"}],
         "GT-Z", False),
    ]
    for label, gt_text, findings, gt_id, expect in cases:
        user = f"## Scanner findings\n{json.dumps(findings, indent=1)}\n\n## Ground truth\n### {gt_text}\n\nRespond with the JSON array."
        raw = llm(args.judge_url, args.judge_key, args.judge_model, JUDGE_SYSTEM, user, 2000, args.judge_timeout)
        try:
            verdict = parse_judge_verdicts(raw, [gt_id], findings)[0]
        except ValueError as exc:
            raise SystemExit(f"judge battery case '{label}': invalid output ({exc}); grader not trusted:\n{str(raw)[:300]}") from None
        got = verdict["detected"]
        if got != expect:
            raise SystemExit(f"judge battery FAILED on '{label}' (expected detected={expect}, got {got}); a grader that cannot fail the wrong answers does not run")


def run_judge(args, gt_findings: list[dict], scanner_findings: list[dict]) -> list[dict]:
    gt_block = "\n\n".join(
        f"### Ground truth {g['id']}: {g['title']}\nCWE: {g['cwe']}. Acceptable classes: {', '.join(g['classes'])}.\n"
        f"Component(s): {', '.join(g['components'])}. Mechanism keywords: {', '.join(g['mechanism_keywords'])}.\n"
        f"Proof hint: {g['proof_hint']}"
        for g in gt_findings)
    user = (f"## Scanner findings\n{json.dumps(scanner_findings, indent=1)}\n\n## Ground truth entries\n{gt_block}\n\n"
            "For EACH ground-truth entry, respond in the JSON array.")
    for attempt in range(3):
        raw = llm(args.judge_url, args.judge_key, args.judge_model, JUDGE_SYSTEM, user, 4000, args.judge_timeout)
        try:
            return parse_judge_verdicts(raw, [g["id"] for g in gt_findings], scanner_findings)
        except ValueError as exc:
            print(f"[judge] invalid output ({exc}; attempt {attempt + 1}/3), retrying")
    raise SystemExit("judge output invalid after 3 attempts; grader not trusted")


# ---------------------------------------------------------------- scoring

def wilson(p_hat: float, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    denom = 1 + z * z / n
    center = (p_hat + z * z / (2 * n)) / denom
    half = z * math.sqrt(p_hat * (1 - p_hat) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, center - half), min(1.0, center + half))


def tally(gt_findings, verdicts, scanner_findings, invalid_ids) -> dict:
    detected = [v for v in verdicts if v.get("detected")]
    matched_ids = {v.get("matched_finding_id") for v in detected}
    candidates = [f for f in scanner_findings if f["id"] not in matched_ids and f["id"] not in invalid_ids]
    gates = {"component": 0, "class": 0, "keywords": 0, "proof": 0}
    gate_scores = []
    for v in detected:
        g = v.get("gates") or {}
        score = (1 if g.get("component") else 0) + (2 if g.get("class") else 0) \
            + (1 if g.get("keywords") else 0) + (1 if g.get("proof") else 0)
        gate_scores.append(score)
        for k in gates:
            gates[k] += 1 if g.get(k) else 0
    n = len(gt_findings)
    rate = len(detected) / n if n else 0.0
    lo, hi = wilson(rate, n)
    tp = len(detected)
    precision_lo = tp / (tp + len(candidates) + len(invalid_ids)) if (tp + len(candidates) + len(invalid_ids)) else 0.0
    precision_hi = tp / tp if tp else 0.0
    return {
        "ground_truth_total": n,
        "detected": tp,
        "detection_rate": round(rate, 4),
        "detection_rate_wilson95": [round(lo, 4), round(hi, 4)],
        "gate_totals_over_detected": gates,
        "mean_gate_score_of_6": round(sum(gate_scores) / len(gate_scores), 2) if gate_scores else None,
        "discovery_candidates": [{"id": c["id"], "name": c["name"]} for c in candidates],
        "precision_bounds_until_verified": [round(precision_lo, 4), round(precision_hi, 4)],
        "invalid_findings_excluded": invalid_ids,
        "scanner_findings_total": len(scanner_findings),
    }


def write_report(out_dir: pathlib.Path, corpus: str, args, task_info, status, findings, verdicts, result) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "results.json").write_text(json.dumps({
        "method_version": METHOD_VERSION,
        "corpus": corpus,
        "ground_truth_version": args.gt_version,
        "task": task_info,
        "task_status": status,
        "subject_model": args.subject_model,
        "llm_profiles": getattr(args, "llm_profiles", ""),
        "judge_model": args.judge_model,
        "result": result,
        "verdicts": verdicts,
        "findings": findings,
    }, indent=2))
    lines = [
        f"# ARTEX benchmark run: {corpus}",
        f"- method `{METHOD_VERSION}`, ground truth `{args.gt_version}`, subject model `{args.subject_model}`, judge `{args.judge_model}`",
        f"- task #{task_info['id']} terminal status: {status}; scanner findings: {result['scanner_findings_total']}",
    ]
    if getattr(args, "llm_profiles", ""):
        lines.append(f"- task llm chain (head first): `{args.llm_profiles}`")
    if result.get("flag_captured") is not None:
        lines.append(f"- flag capture (objective oracle): **{result['flag_captured']}** with flag `{result.get('flag_used')}`")
    if verdicts is None:
        lines.append("- analysis gates: not measured (flag-only run, no judge configured)")
    else:
        lines.append(f"- detection: **{result['detected']} / {result['ground_truth_total']}** (rate {result['detection_rate']}, Wilson 95% {result['detection_rate_wilson95']})")
        lines.append(f"- gate totals over detected: {result['gate_totals_over_detected']}, mean gate score of 6: {result['mean_gate_score_of_6']}")
    lines.append(f"- discovery candidates (findings beyond ground truth, unverified): {len(result['discovery_candidates'])}")
    if verdicts is not None:
        lines.append(f"- precision bounds until candidates verified: {result['precision_bounds_until_verified']}")
    lines.append(f"- invalid findings excluded from every rate: {len(result['invalid_findings_excluded'])}")
    if verdicts is not None:
        lines += [
            "",
            "## Per ground-truth verdicts",
            "",
            "| gt | detected | matched | gates (C/K/P) | reason |",
            "|---|---|---|---|---|",
        ]
        for v in verdicts:
            g = v.get("gates") or {}
            lines.append(f"| {v.get('gt_id')} | {v.get('detected')} | {v.get('matched_finding_id')} | "
                         f"{g.get('component')}/{g.get('class')}/{g.get('keywords')}/{g.get('proof')} | {(v.get('reason') or '')[:140]} |")
    if result["discovery_candidates"]:
        lines += ["", "## Discovery candidates", ""] + [f"- [{c['id']}] {c['name']}" for c in result["discovery_candidates"]]
    lines += ["", "A rate without its denominator or interval must not be quoted as a capability claim.", ""]
    (out_dir / "report.md").write_text("\n".join(lines))
    print(f"[out] {out_dir / 'report.md'}")


# ---------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--corpus", default="juice-shop", help="ground-truth file stem under ground_truth/ (image mode; also the run label in drost mode)")
    ap.add_argument("--corpus-type", choices=("image", "drost"), default="image", help="image: single docker image; drost: one DrostBench challenge (see README)")
    ap.add_argument("--drost-repo", default=os.environ.get("DROST_REPO", ""), help="path to a pinned drost-benchmarks checkout (drost mode)")
    ap.add_argument("--drost-id", default="", help="challenge id, e.g. DBEN-v1-001 (drost mode)")
    ap.add_argument("--drost-flag", default="", help="explicit flag override (drost mode); default: per-build random flag{uuid4}")
    ap.add_argument("--deploy-only", action="store_true", help="drost mode: bring the challenge up, print URL and flag, skip the task")
    ap.add_argument("--llm-profiles", default="", help="comma-separated llm profile ids for the task chain, head first (e.g. 3,2); stamped into the result")
    ap.add_argument("--target-host", default="127.0.0.1", help="host the task should target, as reachable from ARTEX (use 172.17.0.1 when ARTEX runs in a container)")
    ap.add_argument("--run-id", default=time.strftime("%Y%m%d-%H%M%S"))
    ap.add_argument("--image", default="bkimminich/juice-shop:latest")
    ap.add_argument("--port", type=int, default=13100)
    ap.add_argument("--container-port", type=int, default=3000)
    ap.add_argument("--corpus-url", help="use an already-running deployment instead of docker")
    ap.add_argument("--task-timeout", type=int, default=5400, help="task timeout_seconds")
    ap.add_argument("--artex-url", default=os.environ.get("ARTEX_BASE", "http://localhost:8787"))
    ap.add_argument("--gt-version", default="v1")
    ap.add_argument("--subject-model", default="", help="model the task's active profile runs on (for the self-judge guard); required unless --deploy-only")
    ap.add_argument("--judge-url", default=os.environ.get("JUDGE_BASE_URL", ""))
    ap.add_argument("--judge-model", default=os.environ.get("JUDGE_MODEL", ""))
    ap.add_argument("--judge-timeout", type=int, default=900)
    ap.add_argument("--allow-self-judge", action="store_true")
    ap.add_argument("--keep", action="store_true", help="keep the corpus container running after the run")
    args = ap.parse_args()

    args.judge_key = os.environ.get("JUDGE_API_KEY", "")
    if args.corpus_type == "drost":
        if not (args.drost_repo and args.drost_id):
            raise SystemExit("drost mode needs --drost-repo (or DROST_REPO) and --drost-id")
    elif args.deploy_only:
        raise SystemExit("--deploy-only is drost mode only")

    judge_enabled = bool(args.judge_url and args.judge_model and args.judge_key)
    if not args.deploy_only:
        if not args.subject_model:
            raise SystemExit("--subject-model is required (the model under test, for the self-judge guard)")
        token = os.environ.get("ARTEX_TOKEN", "")
        if not token:
            key_path = os.environ.get("ARTEX_JWT_KEY", "")
            if not key_path:
                raise SystemExit("need ARTEX_TOKEN or ARTEX_JWT_KEY")
            token = mint_jwt(key_path)

    # The judge is mandatory in image mode. Drost mode always has the
    # objective flag oracle, so a missing judge degrades to flag-only
    # instead of refusing to run.
    if args.corpus_type != "drost" and not judge_enabled:
        raise SystemExit("need JUDGE_BASE_URL, JUDGE_MODEL, JUDGE_API_KEY")

    # A model never judges its own output (capability-matrix standing rule 5).
    if judge_enabled and args.judge_model == args.subject_model and not args.allow_self_judge:
        raise SystemExit(f"judge model equals subject model ({args.judge_model}); refusing. Pass --allow-self-judge to override knowingly.")

    if args.corpus_type == "drost":
        args.corpus = f"drost-{args.drost_id}"
        gt = drost.derive_ground_truth(args.drost_repo, args.drost_id)
        args.gt_version = gt["version"]
        print(f"[gt] derived from benchmark.json: {gt['corpus']} ({args.gt_version})")
    else:
        gt_path = pathlib.Path(__file__).parent / "ground_truth" / f"{args.corpus}.json"
        gt = json.loads(gt_path.read_text())
    gt_findings = gt["findings"]

    # drost project/dir are deterministic, so they are known before deploy and
    # the finally below can clean up even when the deploy itself fails halfway.
    drost_project = drost_cdir = None
    if args.corpus_type == "drost":
        drost_project = drost.compose_project(args.drost_id, args.run_id)
        drost_cdir = str(drost.challenge_dir(args.drost_repo, args.drost_id))

    try:
        dep = deploy_corpus(args)
        corpus_url = dep["url"]
        flag = dep.get("flag")
        if args.deploy_only:
            print(f"[drost] deploy-only: up at {corpus_url}, flag {flag}")
            print(f"[drost] stop it later with: docker compose -p {dep['project']} down --remove-orphans"
                  f"  (cwd {dep['challenge_dir']})")
            return

        task_url = corpus_url
        if args.target_host != "127.0.0.1":
            task_url = f"http://{args.target_host}:{corpus_url.rsplit(':', 1)[1]}"
            print(f"[corpus] task target rewritten for ARTEX reachability: {task_url}")

        api = Api(args.artex_url, token)
        task_info = create_task(api, args, task_url, gt)
        status = wait_task(api, task_info["id"], args.task_timeout + 1800)
        findings = fetch_findings(api, task_info["id"])

        invalid_ids = [f["id"] for f in findings if not (f["summary"].strip() or f["report"].strip())]
        usable = [f for f in findings if f["id"] not in invalid_ids]

        flag_captured = None
        if flag:
            # Objective oracle first pass over the already-fetched fields; the deep
            # scan (full details, facts, report) runs only before declaring a miss.
            flag_captured = drost.flag_in_texts(flag, drost.finding_texts(findings))
            if not flag_captured:
                flag_captured = drost.flag_in_texts(flag, deep_evidence_texts(api, task_info["id"], findings))
            print(f"[flag] captured: {flag_captured}")

        if judge_enabled:
            if not usable:
                print("[judge] no usable findings; scoring zeros")
                verdicts = [{"gt_id": g["id"], "detected": False, "matched_finding_id": None,
                             "gates": {"component": False, "class": False, "keywords": False, "proof": False},
                             "reason": "no usable scanner findings"} for g in gt_findings]
            else:
                print("[judge] running falsification battery")
                judge_battery(args)
                print("[judge] grading")
                verdicts = run_judge(args, gt_findings, usable)
            result = tally(gt_findings, verdicts, findings, invalid_ids)
        else:
            print("[judge] flag-only run: no judge configured, analysis gates not measured")
            verdicts = None
            result = {
                "mode": "flag-only",
                "scanner_findings_total": len(findings),
                "invalid_findings_excluded": invalid_ids,
                "discovery_candidates": [{"id": f["id"], "name": f["name"]} for f in usable],
                "note": "analysis gates not measured: no judge configured",
            }
        if flag:
            result["flag_captured"] = flag_captured
            result["flag_used"] = flag

        out_dir = pathlib.Path("benchmark-results") / args.corpus / args.run_id
        write_report(out_dir, args.corpus, args, task_info, status, findings, verdicts, result)
        print(json.dumps(result, indent=2)[:1500])
    finally:
        # The corpus is torn down even when a step fails halfway: a crash in
        # deploy, scoring or reporting must not leave the challenge running
        # (--keep and --deploy-only opt out deliberately).
        if args.corpus_type == "drost":
            if not (args.keep or args.deploy_only):
                drost.teardown(drost_project, drost_cdir)
        elif not (args.keep or args.corpus_url):
            subprocess.run(["docker", "rm", "-f", f"bench-{args.corpus}-{args.run_id}"], capture_output=True)


if __name__ == "__main__":
    main()
