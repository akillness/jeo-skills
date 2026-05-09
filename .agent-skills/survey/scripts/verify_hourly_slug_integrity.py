#!/usr/bin/env python3
"""Verify that hourly survey artifacts are confined to one slug directory.

Usage:
  python3 verify_hourly_slug_integrity.py <slug> <git-status-short-file>

Reads git-status short output (captured from `git status --short`) and fails when
modified/untracked files under .survey/ do not belong to the active slug.
"""

import os
import re
import sys


def main():
    if len(sys.argv) != 3:
        sys.stderr.write("usage: verify_hourly_slug_integrity.py <slug> <git-status-short-file>\n")
        return 2

    slug = sys.argv[1].strip()
    status_path = sys.argv[2]

    if not slug:
        sys.stderr.write("empty slug\n")
        return 2
    if not os.path.exists(status_path):
        sys.stderr.write("status file not found: {}\n".format(status_path))
        return 2

    with open(status_path, "r") as f:
        lines = [x.rstrip("\n") for x in f]

    wrong = []
    survey_re = re.compile(r"^\.survey/([^/]+)/")
    allowed_prefix = ".survey/{}/".format(slug)

    for ln in lines:
        if not ln.strip():
            continue
        path = ln[3:].strip() if len(ln) >= 4 else ""
        m = survey_re.match(path)
        if not m:
            continue
        if not path.startswith(allowed_prefix):
            if path == ".survey/.active-hourly-slug":
                continue
            wrong.append(path)

    if wrong:
        sys.stderr.write("slug-integrity-failed\n")
        for p in wrong:
            sys.stderr.write("- {}\n".format(p))
        return 1

    print("slug-integrity-ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
