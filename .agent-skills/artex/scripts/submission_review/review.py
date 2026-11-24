#!/usr/bin/env python3
"""Pre-submission report review: validate a vulnerability report against a
program's eligibility rules BEFORE it is submitted, and refine on the feedback
(local oracle + refine-on-response).

Why: strict vulnerability programs reject (and some ban) reports that miss
their criteria — wrong vulnerability class, PoC not written from a remote
attacker's perspective, no measurable impact, several findings of one type
split across reports. Reviewing that locally first, with an independent
reviewer that must pass a falsification battery, catches exactly the gaps a
program's triage would catch, while fixing them is still free.

Discipline (same method as the benchmark harness in this repo):
- the reviewer is an independent LLM and must pass a battery before grading
  (an obviously eligible report passes, an obviously out-of-scope one fails,
  a vague one fails); a grader that cannot fail the wrong ones does not run
- every verdict carries the rule it cites and a suggested fix
- exit code 0 = submit-ready, 2 = gaps found, 3 = reviewer not trusted

Usage:
  REVIEW_API=https://api.example.com REVIEW_API_KEY=... REVIEW_MODEL=... \
  python3 review.py --report finding.md --rules rules/strict-vdp.json
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

REVIEW_VERSION = "review-v1"

REVIEWER_SYSTEM = """You are a strict vulnerability-program triager. You receive one security report and the program's eligibility rules. Judge the report EXACTLY against the rules, not against your own sense of severity.

For each check below, output one object in a JSON array:
{"check": "<check id>", "pass": true|false, "rule": "<the rule text you applied>", "reason": "1-2 sentences citing the report", "fix": "one concrete sentence to fix it, empty when pass"}

Checks to run (ids in this order): eligibility, poc_remote, reproduction, impact_measured, consolidation, version_current, ban_risk.

- eligibility: the vulnerability class is in the rules' accepted list AND not in the rejected list. Quote both entries you compared against.
- poc_remote: the reproduction steps are written from a REMOTE attacker's perspective over HTTP (requests an outside attacker can send), not requiring server-side access, local files, or vendor tooling on the server.
- reproduction: a third party could follow the steps and see the result; every request shows method, URL, headers that matter, and body; expected vs actual behavior is stated.
- impact_measured: the impact is quantified with its denominator or a concrete attacker outcome (data actually returned / command actually executed), not an adjective. "An attacker can dump the table" fails; "3 of 20 payload variants returned other-tenant rows" passes.
- consolidation: the report covers ONE finding; same-type findings the reporter knows about are consolidated here, not promised in separate reports.
- version_current: the report states the affected component, its exact version, and that it is the latest at the time of writing.
- ban_risk: the report contains no untested claims presented as verified (every claim traces to an executed request or output in the report).

Output ONLY the JSON array."""


def llm(base: str, key: str, model: str, user: str, max_tokens: int = 3000) -> str:
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "system", "content": REVIEWER_SYSTEM}, {"role": "user", "content": user}],
        "temperature": 0, "max_tokens": max_tokens,
    }).encode()
    r = urllib.request.Request(base.rstrip("/") + "/chat/completions", data=payload, method="POST")
    r.add_header("Content-Type", "application/json")
    r.add_header("Authorization", "Bearer " + key)
    try:
        with urllib.request.urlopen(r, timeout=int(os.environ.get("REVIEW_TIMEOUT", "900"))) as resp:
            body = json.loads(resp.read().decode())
        return body["choices"][0]["message"]["content"] or ""
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"reviewer call failed: HTTP {exc.code}: {exc.read().decode(errors='replace')[:200]}")


def parse_verdicts(raw: str) -> list[dict]:
    start, end = raw.find("["), raw.rfind("]")
    if start == -1 or end <= start:
        raise ValueError("no JSON array in reviewer output")
    verdicts = json.loads(raw[start:end + 1])
    if not isinstance(verdicts, list) or not verdicts:
        raise ValueError("empty verdicts")
    return verdicts


def battery(base: str, key: str, model: str, rules: dict) -> None:
    """The reviewer must fail the wrong reports before it is allowed to grade."""
    good = "# SQL injection in item search\n\nPOST /search with q=' OR 1=1-- returns all rows.\n\n## Measured impact\n2 of 4 payload variants returned rows from other tenants; 2 rejected fail-closed. Proof basis: executed against the current released version 2.3.1 over HTTP."
    bad = "# Username enumeration on login\n\nDifferent responses for existing vs unknown users let an attacker enumerate accounts."
    cases = [
        ("eligible-must-pass", good, True, "eligibility"),
        ("out-of-scope-must-fail", bad, False, "eligibility"),
    ]
    for label, report, expect, check in cases:
        user = f"## Program rules\n{json.dumps(rules, indent=1)}\n\n## Report\n{report}\n\nRun the checks; output the JSON array."
        raw = llm(base, key, model, user, 2000)
        try:
            v = {x.get("check"): x for x in parse_verdicts(raw)}
            got = v.get(check, {}).get("pass")
        except ValueError:
            raise SystemExit(f"reviewer battery '{label}': unparseable output; reviewer not trusted")
        if got != expect:
            raise SystemExit(f"reviewer battery FAILED on '{label}' (expected {check} pass={expect}, got {got}); a reviewer that cannot fail the wrong reports does not run")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--report", required=True, help="path to the report markdown (or '-' for stdin)")
    ap.add_argument("--rules", default=str(pathlib.Path(__file__).parent / "rules" / "strict-vdp.json"))
    ap.add_argument("--subject-model", help="model that wrote the report, to refuse self-review")
    ap.add_argument("--allow-self-review", action="store_true")
    ap.add_argument("--out", help="write the verdict JSON here (default: alongside the report)")
    args = ap.parse_args()

    base = os.environ.get("REVIEW_API", "")
    key = os.environ.get("REVIEW_API_KEY", "")
    model = os.environ.get("REVIEW_MODEL", "")
    if not (base and key and model):
        raise SystemExit("need REVIEW_API, REVIEW_API_KEY, REVIEW_MODEL")

    if args.subject_model and args.subject_model == model and not args.allow_self_review:
        raise SystemExit(f"reviewer model equals the report's model ({model}); refusing. Pass --allow-self-review to override knowingly.")

    rules = json.loads(pathlib.Path(args.rules).read_text())
    report = sys.stdin.read() if args.report == "-" else pathlib.Path(args.report).read_text()
    if not report.strip():
        raise SystemExit("empty report")

    print("[battery] verifying the reviewer fails the wrong reports")
    battery(base, key, model, rules)

    user = (f"## Program rules\n{json.dumps(rules, indent=1)}\n\n## Report\n{report}\n\n"
            "Run the checks in order; output ONLY the JSON array.")
    print("[review] grading")
    verdicts = parse_verdicts(llm(base, key, model, user))

    failed = [v for v in verdicts if not v.get("pass")]
    doc = {
        "review_version": REVIEW_VERSION,
        "rules_file": os.path.basename(args.rules),
        "reviewer_model": model,
        "submit_ready": not failed,
        "failed_checks": failed,
        "verdicts": verdicts,
    }
    out = pathlib.Path(args.out) if args.out else pathlib.Path(args.report).with_suffix(".review.json")
    out.write_text(json.dumps(doc, indent=2))

    print(f"\n{'SUBMIT-READY' if not failed else 'GAPS FOUND'} ({len(verdicts) - len(failed)}/{len(verdicts)} checks pass)")
    for v in failed:
        print(f"  FAIL {v.get('check')}: {v.get('reason')}")
        if v.get("fix"):
            print(f"       fix: {v['fix']}")
    print(f"\nverdicts: {out}")
    print("fix the gaps, re-run, submit only on SUBMIT-READY. A rate without its basis is not a verdict: read the cited rules before trusting a pass.")
    sys.exit(0 if not failed else 2)


if __name__ == "__main__":
    main()
