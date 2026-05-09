#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys


def run_cmd(argv):
    try:
        p = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        return {"exit_code": p.returncode, "stdout": p.stdout.strip(), "stderr": p.stderr.strip()}
    except Exception as exc:
        return {"exit_code": 127, "stdout": "", "stderr": str(exc)}


def gh_auth_status():
    if not shutil.which("gh"):
        return {"ok": False, "reason": "gh-not-found"}
    r = run_cmd(["gh", "auth", "status"])
    return {"ok": r["exit_code"] == 0, "reason": "ok" if r["exit_code"] == 0 else "gh-auth-failed", "detail": r}


def main():
    if len(sys.argv) != 2:
        sys.stderr.write("usage: check_hourly_toolchain.py <output-json>\n")
        return 2

    output_json = sys.argv[1]
    checks = []
    for name in ["gh", "git", "python3", "bash", "rtk", "graphify", "obsidian"]:
        path = shutil.which(name)
        checks.append({"tool": name, "present": bool(path), "path": path or ""})

    gh_auth = gh_auth_status()

    payload = {
        "status": "pass",
        "degraded_causes": [],
        "checks": checks,
        "gh_auth": gh_auth,
    }

    required = ["gh", "git", "python3", "bash"]
    missing_required = [c["tool"] for c in checks if (c["tool"] in required and not c["present"])]
    if missing_required:
        payload["status"] = "degraded"
        payload["degraded_causes"].append("missing-required-tools")
        payload["missing_required_tools"] = missing_required

    if not gh_auth.get("ok", False):
        payload["status"] = "degraded"
        payload["degraded_causes"].append("gh-auth")

    os.makedirs(os.path.dirname(output_json), exist_ok=True)
    with open(output_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print("wrote {}".format(output_json))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
