#!/usr/bin/env python3
"""Isolated CLI smoke check for okf-agent-memory (okf init + validate in a temp dir)."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run an isolated okf init + validate smoke check in a temporary directory."
    )
    parser.add_argument("--binary", default="okf", help="okf executable path or name on PATH")
    parser.add_argument("--json", action="store_true", help="emit JSON report")
    return parser.parse_args()


def resolve_binary(raw: str) -> str | None:
    candidate = Path(raw).expanduser()
    if "/" in raw or "\\" in raw:
        return str(candidate) if candidate.is_file() and os.access(candidate, os.X_OK) else None
    search_path = f"{Path.home() / '.local/bin'}:/opt/homebrew/bin:/usr/local/bin:" + os.environ.get("PATH", "")
    return shutil.which(raw, path=search_path)


def main() -> int:
    args = parse_args()
    binary = resolve_binary(args.binary)
    if not binary:
        payload = {
            "skill": "okf-agent-memory",
            "binary": args.binary,
            "runtime_verified": False,
            "exit_code": 2,
            "error": f"Executable not found: {args.binary}",
        }
        if args.json:
            print(json.dumps(payload, indent=2))
        else:
            print(payload["error"], file=sys.stderr)
        return 2

    checks: list[dict[str, object]] = []
    with tempfile.TemporaryDirectory(prefix="okf-smoke-") as tmp:
        tmp_dir = Path(tmp)
        ver = subprocess.run([binary, "--version"], cwd=tmp_dir, capture_output=True, text=True, timeout=10)
        checks.append({
            "name": "version",
            "status": "pass" if ver.returncode == 0 else "fail",
            "output": ver.stdout.strip() or ver.stderr.strip(),
        })
        init_res = subprocess.run([binary, "init", "knowledge"], cwd=tmp_dir, capture_output=True, text=True, timeout=10)
        bundle = tmp_dir / "knowledge"
        init_ok = init_res.returncode == 0 and (bundle / "index.md").is_file() and (bundle / "log.md").is_file()
        checks.append({
            "name": "init_bundle",
            "status": "pass" if init_ok else "fail",
        })
        val_res = subprocess.run([binary, "validate", "knowledge"], cwd=tmp_dir, capture_output=True, text=True, timeout=10)
        checks.append({
            "name": "validate_bundle",
            "status": "pass" if val_res.returncode == 0 else "fail",
        })

    passed = all(c["status"] == "pass" for c in checks)
    payload = {
        "skill": "okf-agent-memory",
        "binary": binary,
        "checks": checks,
        "runtime_verified": "cli-init-validate" if passed else False,
        "exit_code": 0 if passed else 1,
    }
    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        for check in checks:
            print(f"{check['name']}: {check['status']}")
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
