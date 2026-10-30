#!/usr/bin/env python3
"""Runtime smoke test for an installed Open Ontologies binary.

Runs ONE local `batch` process against a throw-away data directory and checks
that the engine loads RDF, answers SPARQL, and derives a new triple under the
built-in RDFS profile. This is the only thing it proves: the CLI batch surface
of that binary works on this host. It says nothing about MCP transports,
certificates, other profiles, or your data.

Nothing is written outside a temporary directory; `--no-connect` keeps the run
off any daemon. Exit 0 = pass, 1 = the binary ran but a check failed, 2 = the
binary could not be run or the arguments were invalid.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

PREFIX = "https://example.org/open-ontologies-smoke/"
TURTLE = f"""@prefix ex: <{PREFIX}> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
ex:invokes rdfs:subPropertyOf ex:dependsOn .
ex:ci ex:invokes ex:validator .
"""
QUERY = f"SELECT ?consumer WHERE {{ ?consumer <{PREFIX}dependsOn> <{PREFIX}validator> }}"
EXPECTED_CONSUMER = f"<{PREFIX}ci>"
TIMEOUT_SECONDS = 120


def fail(report, reason, code):
    report["status"] = "fail"
    report["reason"] = reason
    return code


def run(binary):
    report = {"skill": "open-ontologies", "binary": binary, "scope": "cli-batch-rdfs", "checks": []}
    resolved = shutil.which(binary) if os.sep not in binary else binary
    if not resolved or not os.access(resolved, os.X_OK):
        return fail(report, f"binary not found or not executable: {binary}", 2), report
    report["binary"] = os.path.abspath(resolved)

    with tempfile.TemporaryDirectory(prefix="open-ontologies-smoke-") as tmp:
        ttl = os.path.join(tmp, "smoke.ttl")
        with open(ttl, "w", encoding="utf-8") as handle:
            handle.write(TURTLE)
        commands = [
            {"command": "load", "args": [ttl]},
            {"command": "query", "args": [QUERY]},
            {"command": "reason", "args": ["--profile", "rdfs"]},
            {"command": "query", "args": [QUERY]},
        ]
        argv = [resolved, "--no-connect", "--data-dir", os.path.join(tmp, "data"), "batch", "--bail", "-"]
        try:
            proc = subprocess.run(argv, input=json.dumps(commands), text=True, capture_output=True, timeout=TIMEOUT_SECONDS)
        except (OSError, subprocess.TimeoutExpired) as exc:
            return fail(report, f"could not run batch: {exc}", 2), report

    report["exit_code"] = proc.returncode
    if proc.returncode != 0:
        report["stderr"] = proc.stderr[-2000:]
        return fail(report, "batch exited non-zero", 1), report
    try:
        results = [json.loads(line)["result"] for line in proc.stdout.splitlines() if line.strip()]
    except (ValueError, KeyError, TypeError):
        report["stdout"] = proc.stdout[-2000:]
        return fail(report, "batch output was not the expected JSON lines", 1), report
    if len(results) != 4:
        report["stdout"] = proc.stdout[-2000:]
        return fail(report, f"expected 4 results, got {len(results)}", 1), report
    load, before, reason, after = results

    checks = [
        ("load_two_triples", load.get("triples_loaded") == 2),
        ("no_inferred_row_before_reason", before.get("results") == []),
        ("rdfs_reason_infers_one", reason.get("inferred_count") == 1 and reason.get("fixpoint_reached") is True),
        ("inferred_row_after_reason", after.get("results") == [{"consumer": EXPECTED_CONSUMER}]),
    ]
    report["checks"] = [{"name": name, "status": "pass" if ok else "fail"} for name, ok in checks]
    report["reason_result"] = {k: reason.get(k) for k in ("profile_used", "initial_triples", "inferred_count", "final_triples", "fixpoint_reached")}
    if not all(ok for _, ok in checks):
        report["results"] = results
        return fail(report, "one or more checks failed", 1), report
    report["status"] = "pass"
    report["runtime_verified"] = "cli-batch-rdfs only; not MCP, certificates, or other profiles"
    return 0, report


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--binary", default="open-ontologies", help="path or PATH name of the open-ontologies binary")
    parser.add_argument("--json", action="store_true", help="print the full report as JSON")
    args = parser.parse_args()
    code, report = run(args.binary)
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(f"open-ontologies smoke: {report.get('status', 'fail')} ({report['binary']})")
        for check in report["checks"]:
            print(f"  {check['status']:4}  {check['name']}")
        if report.get("reason"):
            print(f"  reason: {report['reason']}")
    return code


if __name__ == "__main__":
    sys.exit(main())
