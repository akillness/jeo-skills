#!/usr/bin/env python3
"""Read-only AnyJev host, distribution, and checkout preflight."""
from __future__ import annotations
import os
import argparse
import importlib.metadata as metadata
import json
import platform
import re
import shutil
import subprocess
import sys
from pathlib import Path
SKILL, SCOPE = "anyjev", "offline-preflight"
MIN_PYTHON, MIN_NUMPY = (3, 10), (1, 24)
PINNED_ANYJEV = "0.3.0"
SHA = re.compile(r"^[0-9a-fA-F]{40}$")
class InputError(ValueError):
    pass
class Parser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise InputError(message)
def parser() -> argparse.ArgumentParser:
    p = Parser(prog="preflight.py", description="Offline, metadata-only AnyJev preflight.", allow_abbrev=False)
    p.add_argument("--json", action="store_true", help="emit one JSON result object")
    p.add_argument("--repo", type=Path, help="local AnyJev checkout to inspect")
    p.add_argument("--expect-commit", help="full 40-hex checkout commit; requires --repo")
    return p
def check(name: str, status: str, detail: str, required: bool = False) -> dict[str, object]:
    return {"name": name, "status": status, "required": required, "detail": detail}
def version(value: str) -> tuple[int, ...]:
    match = re.match(r"^\s*(\d+(?:\.\d+)*)", value)
    return tuple(int(part) for part in match.group(1).split(".")) if match else (0,)
def prerelease(value: str) -> bool:
    return bool(re.match(r"^\s*\d+(?:\.\d+)*(?:[-_.]?(?:dev|a|b|rc)\d*)", value.lower()))
def distribution(name: str, required: bool, minimum: tuple[int, ...] | None = None, exact: str | None = None) -> tuple[dict[str, object], bool]:
    try:
        found = metadata.version(name)
    except metadata.PackageNotFoundError:
        return check(name, "missing", f"{name} distribution metadata not found", required), required
    except Exception as exc:
        return check(name, "error", f"metadata unavailable: {type(exc).__name__}", required), required
    bad = (exact is not None and found.strip() != exact) or (minimum is not None and (prerelease(found) or version(found) < minimum))
    detail = f"detected version {found}"
    if bad:
        detail += f"; requires == {exact}" if exact is not None else f"; requires >= {'.'.join(map(str, minimum))}"
    return check(name, "mismatch" if bad else "detected", detail, required), bool(bad and required)
def optional_distributions(names: tuple[str, ...]) -> list[dict[str, object]]:
    out = []
    for name in names:
        try:
            found = metadata.version(name)
        except metadata.PackageNotFoundError:
            out.append(check(name, "not-installed", "optional distribution metadata not found"))
        except Exception as exc:
            out.append(check(name, "error", f"metadata unavailable: {type(exc).__name__}"))
        else:
            out.append(check(name, "detected", f"distribution metadata version {found}"))
    return out
def optional_tools(names: tuple[str, ...]) -> list[dict[str, object]]:
    out = []
    for name in names:
        found = shutil.which(name)
        out.append(check(f"tool:{name}", "detected" if found else "not-installed", f"found at {found}" if found else "not found on PATH"))
    return out
def git(repo: Path, *args: str) -> tuple[str | None, str | None]:
    git_bin = shutil.which("git")
    if git_bin is None:
        return None, "git not found on PATH"
    env = {"PATH": os.environ.get("PATH", os.defpath), "GIT_TERMINAL_PROMPT": "0", "GIT_OPTIONAL_LOCKS": "0", "GIT_ALLOW_PROTOCOL": "", "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": os.devnull}
    for key in ("SYSTEMROOT", "WINDIR", "PATHEXT", "TMPDIR", "TEMP", "TMP"):
        value = os.environ.get(key)
        if value:
            env[key] = value
    try:
        result = subprocess.run([git_bin, "-C", str(repo), *args], capture_output=True, text=True, check=False, timeout=5, env=env)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, type(exc).__name__
    if result.returncode:
        return None, (result.stderr or f"git exited {result.returncode}").strip()[:160]
    return result.stdout.strip(), None
def checkout(path: Path, expected: str | None) -> tuple[list[dict[str, object]], bool]:
    p, out = path.expanduser(), []
    if not p.exists():
        return [check("repo", "missing", f"checkout path does not exist: {p}", True)], True
    if not p.is_dir():
        return [check("repo", "mismatch", f"checkout path is not a directory: {p}", True)], True
    inside, error = git(p, "rev-parse", "--is-inside-work-tree")
    if inside != "true":
        return [check("repo.git", "mismatch", f"not a Git work tree: {error or inside or 'unknown error'}", True)], True
    out.append(check("repo.git", "detected", "local Git work tree", True))
    root, error = git(p, "rev-parse", "--show-toplevel")
    if root is None:
        return out + [check("repo.root", "error", f"cannot resolve Git top-level: {error}", True)], True
    resolved = p.resolve()
    if Path(root).resolve() != resolved:
        return out + [check("repo.root", "mismatch", f"Git top-level {root} does not match {resolved}", True)], True
    out.append(check("repo.root", "matched", f"Git top-level {resolved}", True))
    head, error = git(p, "rev-parse", "HEAD")
    if head is None:
        return out + [check("repo.commit", "error", f"cannot read HEAD: {error}", True)], True
    out.append(check("repo.commit", "detected", f"HEAD {head}", True))
    if expected is not None:
        if head.lower() != expected.lower():
            return out + [check("repo.expected_commit", "mismatch", f"expected {expected}, found {head}", True)], True
        out.append(check("repo.expected_commit", "matched", f"HEAD matches {expected}", True))
    paths = (
        "pyproject.toml", "README.md", "anyjev/__init__.py", "anyjev/tacit.py", "anyjev/serve.py",
        "anyjev/backends", "anyjev/backends/vllm.py", "anyjev/backends/sglang.py", "anyjev/backends/llamacpp.py",
        "docs/levels.md", "docs/limitations.md",
    )
    missing = [item for item in paths if not (p / item).exists()]
    if missing:
        return out + [check("repo.shape", "mismatch", "missing public paths: " + ", ".join(missing), True)], True
    return out + [check("repo.shape", "detected", f"required public paths present ({len(paths)})", True)], False
def emit(status: str, checks: list[dict[str, object]], as_json: bool) -> None:
    result = {"skill": SKILL, "scope": SCOPE, "status": status, "checks": checks, "runtime_verified": False}
    if as_json:
        print(json.dumps(result, sort_keys=True))
    else:
        print(f"{SKILL} {SCOPE}: {status} (runtime_verified=false)")
        for item in checks:
            required = " required" if item.get("required") else " optional"
            print(f"- {item['name']}: {item['status']}{required} — {item['detail']}")

def main(argv: list[str] | None = None) -> int:
    raw = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in raw
    try:
        args = parser().parse_args(raw)
    except InputError as exc:
        emit("error", [check("arguments", "error", str(exc), True)], as_json)
        return 2
    if args.expect_commit is not None and args.repo is None:
        emit("error", [check("arguments", "error", "--expect-commit requires --repo", True)], as_json)
        return 2
    if args.expect_commit is not None and not SHA.fullmatch(args.expect_commit):
        emit("error", [check("arguments", "error", "--expect-commit must be a full 40-hex SHA", True)], as_json)
        return 2

    checks = []
    py_ok = sys.version_info[:2] >= MIN_PYTHON
    checks.append(check("python", "detected" if py_ok else "mismatch", f"running {platform.python_version()} (requires >= {MIN_PYTHON[0]}.{MIN_PYTHON[1]})", True))
    checks.append(check("host", "detected", f"{platform.system()} {platform.machine()}"))
    anyjev, anyjev_bad = distribution("anyjev", True, exact=PINNED_ANYJEV)
    numpy, numpy_bad = distribution("numpy", True, MIN_NUMPY)
    checks.extend((anyjev, numpy))
    checks.extend(optional_distributions(("transformers", "torch", "vllm", "sglang", "llama-cpp-python", "tokenizers", "datasets")))
    checks.extend(optional_tools(("vllm", "sglang", "llama-cli", "llama-server")))
    repo_bad = False
    if args.repo is not None:
        repo_checks, repo_bad = checkout(args.repo, args.expect_commit)
        checks.extend(repo_checks)
    blocked = not py_ok or anyjev_bad or numpy_bad or repo_bad
    emit("blocked" if blocked else "ok", checks, as_json)
    return 1 if blocked else 0


if __name__ == "__main__":
    raise SystemExit(main())
