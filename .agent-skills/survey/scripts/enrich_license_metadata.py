#!/usr/bin/env python3
"""Enrich GitHub repo license metadata for hourly survey runs.

Input: JSON array of repos (gh search repos shape) on stdin or --input path.
Output: JSON array with `license_enriched` and `license_enrichment_source` fields.

Resolution order per repo:
1) existing license payload keys (spdx_id/spdxId/key/name)
2) gh repo view <owner/repo> --json licenseInfo
3) gh api repos/<owner>/<repo> --jq .license.spdx_id
"""
import argparse
import json
import subprocess
import sys


def norm_license(lic):
    if isinstance(lic, str) and lic:
        return lic
    if isinstance(lic, dict):
        for k in ("spdx_id", "spdxId", "key", "name"):
            v = lic.get(k)
            if v:
                return v
    return None


def repo_license_from_view(full_name):
    p = subprocess.run([
        "gh", "repo", "view", full_name, "--json", "licenseInfo"
    ], capture_output=True, text=True)
    if p.returncode != 0:
        return None
    try:
        data = json.loads(p.stdout)
        info = data.get("licenseInfo") or {}
        return info.get("spdxId") or info.get("name")
    except Exception:
        return None


def repo_license_from_api(full_name):
    p = subprocess.run([
        "gh", "api", "repos/{0}".format(full_name), "--jq", ".license.spdx_id"
    ], capture_output=True, text=True)
    if p.returncode != 0:
        return None
    val = (p.stdout or "").strip()
    if val and val != "null":
        return val
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", help="JSON file path. If omitted, read stdin.")
    ap.add_argument("--output", help="Output file path. Default: stdout")
    args = ap.parse_args()

    raw = open(args.input).read() if args.input else sys.stdin.read()
    repos = json.loads(raw)
    out = []
    for r in repos:
        full_name = r.get("fullName") or ""
        lic = norm_license(r.get("license"))
        src = "search-payload"
        if not lic and full_name:
            lic = repo_license_from_view(full_name)
            src = "gh-repo-view"
        if not lic and full_name:
            lic = repo_license_from_api(full_name)
            src = "gh-api"
        row = dict(r)
        row["license_enriched"] = lic
        row["license_enrichment_source"] = src if lic else "unresolved"
        out.append(row)

    text = json.dumps(out, indent=2)
    if args.output:
        with open(args.output, "w") as f:
            f.write(text)
            f.write("\n")
    else:
        sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
