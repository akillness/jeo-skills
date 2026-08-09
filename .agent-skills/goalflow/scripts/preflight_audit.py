#!/usr/bin/env python3
"""Pre-publish / pre-deploy security gate for a goalflow (wanmol/goal-flow) checkout.

Stdlib-only. Automates the upstream checklist in
docs/security-and-open-sourcing.md, whose central warning is that untracking
`.env*` does NOT remove it from git history.

Checks:
  tracked_secrets     secret-ish files still tracked by git
  history_secrets     .env* blobs still reachable in git history
  gitignore_env       .gitignore covers .env / .env.* / .env_*
  env_example         a placeholder .env.example ships
  license             a LICENSE file exists
  internal_hosts      hard-coded internal IPs / cloud endpoints in source
  cors_open           allow_origins="*" together with allow_credentials=True
  md5_auth            MD5-keyed API-key -> workflow map
  code_exec           CodeNode exec path / disabled safe_check guard

Usage:
  preflight_audit.py /path/to/goal-flow
  preflight_audit.py .            # from inside the checkout

Output: one ```review fenced JSON block.
Exit code: 1 if any blocker is present, 2 on usage/IO error, else 0.

A clean result is NOT authorization to publish. It cannot prove a secret was
never committed under a filename this script does not know about. Rotation --
not scrubbing -- is what actually ends exposure.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

# .env.example is the intended placeholder template, never a secret file.
SECRET_FILE_RE = re.compile(r"(^|/)(\.env($|[._])|.*\.pem$|.*\.key$|.*\.log$)")
EXAMPLE_FILE_RE = re.compile(r"(^|/)\.env\.(example|sample|template)$")

# Reviewed rather than untracked: upstream says "check for embedded secrets".
REVIEW_FILE_RE = re.compile(r"(^|/)deployment\.ya?ml$")

ENV_PATHS = (".env", ".env_prod", ".env_test", ".env_uat", ".env_dev", ".env.local")

# RFC1918 ranges the project is known to pin — a real leak.
PRIVATE_IP_RE = re.compile(r"\b10\.3\.\d{1,3}\.\d{1,3}\b|\b172\.26\.\d{1,3}\.\d{1,3}\b")
# Vendor endpoints — legitimate in a placeholder, but worth making configurable.
VENDOR_HOST_RE = re.compile(r"[\w.-]*\.aliyuncs\.com")

SOURCE_SUFFIXES = (".py", ".yaml", ".yml", ".toml", ".json", ".md")

SKIP_DIRS = {".git", "venv", ".venv", "node_modules", "__pycache__", ".mypy_cache",
             ".pytest_cache", "dist", "build", ".idea", ".vscode"}


def git(repo: str, *args: str) -> tuple[int, str]:
    try:
        p = subprocess.run(
            ["git", "-C", repo, *args],
            capture_output=True, text=True, timeout=60,
        )
        return p.returncode, p.stdout
    except (OSError, subprocess.SubprocessError):
        return 1, ""


def is_git_repo(repo: str) -> bool:
    rc, out = git(repo, "rev-parse", "--is-inside-work-tree")
    return rc == 0 and out.strip() == "true"


def walk_sources(repo: str):
    for root, dirs, files in os.walk(repo):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if name.endswith(SOURCE_SUFFIXES) or name.startswith(".env"):
                yield os.path.join(root, name)


def read(path: str) -> str:
    try:
        with open(path, encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def audit(repo: str) -> list[dict]:
    findings: list[dict] = []

    def add(severity, check_id, message, remediation, evidence=None):
        findings.append({
            "id": check_id,
            "severity": severity,
            "message": message,
            "remediation": remediation,
            "evidence": evidence or [],
        })

    repo_is_git = is_git_repo(repo)

    # --- 1. secret-ish files still tracked -------------------------------
    if repo_is_git:
        rc, out = git(repo, "ls-files")
        listed = out.splitlines()
        tracked = [l for l in listed
                   if SECRET_FILE_RE.search(l) and not EXAMPLE_FILE_RE.search(l)]
        if tracked:
            add("blocker", "tracked_secrets",
                f"{len(tracked)} secret-bearing file(s) are still tracked by git.",
                "Untrack them (git rm --cached), add them to .gitignore, and rotate "
                "anything they contained.",
                tracked[:20])
        review = [l for l in listed if REVIEW_FILE_RE.search(l)]
        if review:
            add("warning", "review_deploy_config",
                "Deployment config is tracked; upstream flags it for embedded-secret review.",
                "Read it before publishing. Move any credential into a secret store or env "
                "var; the file itself can legitimately stay tracked once it is clean.",
                review[:10])
    else:
        add("info", "not_a_git_repo",
            "Target is not a git work tree; history and tracked-file checks were skipped.",
            "Run this against a real checkout to get the history findings, which are "
            "the ones that matter most.")

    # --- 2. .env* still reachable in history ------------------------------
    if repo_is_git:
        in_history = []
        for path in ENV_PATHS:
            rc, out = git(repo, "log", "--all", "--oneline", "--", path)
            if rc == 0 and out.strip():
                in_history.append(f"{path} ({len(out.strip().splitlines())} commit(s))")
        if in_history:
            add("blocker", "history_secrets",
                "Environment files are still reachable in git history. Untracking them "
                "did NOT remove them; any clone can recover the credentials.",
                "1) Rotate every credential now, independently of cleanup. "
                "2) Scrub with: git filter-repo --path .env --path .env_prod "
                "--path .env_test --path .env_uat --invert-paths. "
                "3) Force-push to a FRESH remote -- never one that already carries them.",
                in_history)

    # --- 3. .gitignore coverage ------------------------------------------
    gi = read(os.path.join(repo, ".gitignore"))
    if not gi:
        add("warning", "gitignore_env",
            "No .gitignore found.",
            "Add .gitignore covering .env, .env.*, .env_* with a !.env.example exception.")
    else:
        covered = any(p in gi for p in (".env_*", ".env.*", ".env*"))
        if ".env" not in gi:
            add("blocker", "gitignore_env",
                ".gitignore does not mention .env at all.",
                "Add .env, .env.*, .env_* with a !.env.example exception.")
        elif not covered:
            add("warning", "gitignore_env",
                ".gitignore mentions .env but may not cover .env_prod / .env_test / .env_uat.",
                "Add explicit .env.* and .env_* patterns plus !.env.example.")

    # --- 4. .env.example present ------------------------------------------
    example = os.path.join(repo, ".env.example")
    if not os.path.exists(example):
        add("warning", "env_example",
            "No .env.example template ships.",
            "Add a placeholder-only template so users know what to fill in.")
    else:
        body = read(example)
        leaked = [
            ln.split("=", 1)[0]
            for ln in body.splitlines()
            if re.match(r"^\s*(\w*(KEY|SECRET|PASSWORD|TOKEN))\s*=\s*\S+", ln)
            and not re.search(r"your-|<|placeholder|xxx|changeme|\.\.\.", ln, re.I)
        ]
        if leaked:
            add("blocker", "env_example",
                f".env.example appears to contain {len(leaked)} real value(s), not placeholders.",
                "Replace every value with an obvious placeholder and rotate what leaked.",
                leaked[:15])

    # --- 5. LICENSE --------------------------------------------------------
    if not any(os.path.exists(os.path.join(repo, n))
               for n in ("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING")):
        add("warning", "license",
            "No LICENSE file found.",
            "Add one before publishing; upstream ships MIT.")

    # --- 6..9 source scans -------------------------------------------------
    internal_hits: list[str] = []
    vendor_hits: list[str] = []
    cors_origins: list[str] = []
    cors_creds: list[str] = []
    md5_auth: list[str] = []
    code_exec: list[str] = []

    for path in walk_sources(repo):
        rel = os.path.relpath(path, repo)
        body = read(path)
        if not body:
            continue

        for m in PRIVATE_IP_RE.finditer(body):
            internal_hits.append(f"{rel}:{body.count(chr(10), 0, m.start()) + 1}: {m.group(0)}")
            if len(internal_hits) > 40:
                break
        for m in VENDOR_HOST_RE.finditer(body):
            vendor_hits.append(f"{rel}:{body.count(chr(10), 0, m.start()) + 1}: {m.group(0)}")
            if len(vendor_hits) > 40:
                break

        if rel.endswith(".py"):
            if re.search(r"allow_origins\s*=\s*\[?\s*[\"']\*[\"']", body):
                cors_origins.append(rel)
            if re.search(r"allow_credentials\s*=\s*True", body):
                cors_creds.append(rel)
            if re.search(r"md5\s*\(", body, re.I) and "apikey" in body.lower():
                md5_auth.append(rel)
            if re.search(r"^\s*#\s*(TODO|FIXME).*safe_check|safe_check.*(TODO|disabled)", body,
                         re.I | re.M):
                code_exec.append(f"{rel} (safe_check guard marked TODO/disabled)")
            elif "class CodeNode" in body and re.search(r"\bexec\s*\(", body):
                code_exec.append(f"{rel} (CodeNode exec path)")

    if internal_hits:
        add("blocker", "internal_hosts",
            f"{len(internal_hits)} hard-coded private-network IP reference(s) found "
            "(RFC1918 ranges this project is known to pin).",
            "Replace with env vars plus documented defaults, and scrub internal IPs and "
            "domains from committed files. This also affects correctness: the DSL parser's "
            "DEFAULT_HOST_SUBSTITUTIONS will rewrite your URLs to hosts you do not own.",
            internal_hits[:20])

    if vendor_hits:
        add("info", "vendor_endpoints",
            f"{len(vendor_hits)} Alibaba Cloud endpoint reference(s) found.",
            "These are public vendor endpoints, not leaks -- they are legitimate in "
            ".env.example and docs. Flagged because they encode the project's origin: make "
            "them configurable if you are not on Alibaba Cloud.",
            vendor_hits[:20])

    shared = sorted(set(cors_origins) & set(cors_creds))
    if shared:
        add("warning", "cors_open",
            "allow_origins=\"*\" is combined with allow_credentials=True -- invalid per the "
            "CORS spec and unsafe.",
            "Restrict allow_origins to known origins for any real deployment.",
            shared)

    if md5_auth:
        add("warning", "md5_auth",
            "API keys appear to be looked up by MD5 digest.",
            "MD5 is unsuitable for hashing secrets. Use a constant-time compare of a strong "
            "hash or a proper token store. At minimum, document the map as a demo mechanism "
            "-- never present it as production auth.",
            sorted(set(md5_auth))[:10])

    if code_exec:
        add("warning", "code_exec",
            "CodeNode executes provided Python via exec, and the AST guard may be disabled.",
            "Treat DSL/model-provided code as trusted input only. Re-enable and strengthen "
            "sandboxing before accepting untrusted DSL exports -- otherwise an untrusted "
            "Dify export is remote code execution.",
            sorted(set(code_exec))[:10])

    return findings


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Pre-publish security gate for a goalflow checkout.")
    ap.add_argument("repo", nargs="?", default=".", help="path to the goal-flow checkout")
    args = ap.parse_args()

    repo = os.path.abspath(args.repo)
    if not os.path.isdir(repo):
        print(f"error: not a directory: {repo}", file=sys.stderr)
        return 2

    findings = audit(repo)
    counts = {lvl: 0 for lvl in ("blocker", "warning", "info")}
    for f in findings:
        counts[f["severity"]] += 1

    report = {
        "tool": "goalflow/preflight_audit",
        "check": "pre-publish / pre-deploy security gate",
        "repo": repo,
        "counts": counts,
        "verdict": "blocked" if counts["blocker"] else ("review" if counts["warning"] else "clean"),
        "findings": findings,
        "limits": [
            "Static analysis plus git metadata; no content is decrypted or fetched.",
            "Cannot prove a secret was never committed under an unknown filename.",
            "A clean result is not authorization to publish.",
            "Scrubbing history reduces exposure; only rotation ends it.",
        ],
    }

    print("```review")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print("```")
    return 1 if counts["blocker"] else 0


if __name__ == "__main__":
    sys.exit(main())
