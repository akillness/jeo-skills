#!/usr/bin/env python3
"""Offline workspace and provider-config preflight helper for open-intelligent-ui; never reads secret values, makes network calls, or spawns processes."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys

BLOCKED_PARTS = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "token", "api_key", "apikey"}

ENV_VAR_NAMES = (
    "THESYS_API_KEY",
    "THESYS_MODEL",
    "THESYS_BASE_URL",
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "LLM_MODEL",
    "LLM_REASONING_EFFORT",
    "MODEL_PROVIDER",
    "OLLAMA_MODEL",
    "OLLAMA_BASE_URL",
)

EXPECTED_GENERATED = (
    "spec.json",
    "system-prompt.txt",
    "dashboard-system-prompt.txt",
    "coach-spec.json",
    "coach-system-prompt.txt",
    "chess-spec.json",
    "chess-system-prompt.txt",
)


class PreflightError(Exception):
    def __init__(self, message: str, exit_code: int = 2):
        super().__init__(message)
        self.exit_code = exit_code


def validate_safe_path(raw_path: str, must_exist: bool = True, must_dir: bool = False) -> Path:
    if not raw_path:
        raise PreflightError("empty path provided", 2)
    p = Path(raw_path)
    if not p.is_absolute():
        raise PreflightError(f"path must be absolute: {raw_path}", 2)
    for part in p.parts:
        if part in BLOCKED_PARTS:
            raise PreflightError(f"sensitive path component refused: {part}", 2)
        stem = part.split(".")[0].lower()
        if stem in SENSITIVE_STEMS:
            raise PreflightError(f"sensitive filename refused: {part}", 2)
    resolved = p.resolve()
    if must_exist and not resolved.exists():
        raise PreflightError(f"path does not exist: {resolved}", 2)
    if must_dir and resolved.exists() and not resolved.is_dir():
        raise PreflightError(f"expected directory path: {resolved}", 2)
    return resolved


def scan_env_keys(env_path: Path) -> dict[str, bool]:
    """Return boolean presence of known configuration keys without returning values."""
    present: dict[str, bool] = {}
    if not env_path.is_file():
        return present
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            k = key.strip()
            if k in ENV_VAR_NAMES:
                present[k] = bool(val.strip())
    except OSError:
        pass
    return present


def inspect_workspace(workspace: Path) -> dict:
    pkg_path = workspace / "package.json"
    pkg_data = None
    if pkg_path.is_file():
        try:
            loaded = json.loads(pkg_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                pkg_data = loaded
        except (OSError, json.JSONDecodeError):
            pkg_data = None

    deps = {}
    if pkg_data:
        for sec in ("dependencies", "devDependencies"):
            block = pkg_data.get(sec)
            if isinstance(block, dict):
                deps.update(block)

    openui_pkgs = sorted(k for k in deps if k.startswith("@openuidev/"))
    gen_dir = workspace / "src" / "generated"
    generated_files = [name for name in EXPECTED_GENERATED if (gen_dir / name).is_file()]
    env_keys = scan_env_keys(workspace / ".env")

    return {
        "path": str(workspace),
        "has_package_json": pkg_data is not None,
        "node_engine": (pkg_data or {}).get("engines", {}).get("node"),
        "openui_packages": openui_pkgs,
        "has_library_extend": (workspace / "src" / "lib" / "library.ts").is_file(),
        "generated_present": generated_files,
        "has_env_example": (workspace / ".env.example").is_file(),
        "has_env": (workspace / ".env").is_file(),
        "env_keys_set": env_keys,
    }


def run_preflight(workspace_arg: str | None = None) -> dict:
    node_bin = shutil.which("node")
    npm_bin = shutil.which("npm")
    checks = [
        {"name": "node", "status": "ok" if node_bin else "missing", "detail": node_bin or "Node 24+ required"},
        {"name": "npm", "status": "ok" if npm_bin else "missing", "detail": npm_bin or "not found in PATH"},
    ]
    ws_info = None
    if workspace_arg is not None:
        ws = validate_safe_path(workspace_arg, must_exist=True, must_dir=True)
        ws_info = inspect_workspace(ws)
        checks.append({
            "name": "openui-packages",
            "status": "ok" if ws_info["openui_packages"] else "missing",
            "detail": ", ".join(ws_info["openui_packages"]) or "no @openuidev/* dependencies found",
        })
        checks.append({
            "name": "generated-artifacts",
            "status": "ok" if len(ws_info["generated_present"]) >= 2 else "info",
            "detail": f"{len(ws_info['generated_present'])}/{len(EXPECTED_GENERATED)} generated specs/prompts",
        })

    ready = bool(node_bin and npm_bin and (ws_info is None or (ws_info["has_package_json"] and ws_info["openui_packages"])))
    return {
        "skill": "open-intelligent-ui",
        "scope": "offline-preflight",
        "status": "ready" if ready else "blocked",
        "runtime_verified": False,
        "cli": {"node": node_bin, "npm": npm_bin},
        "workspace": ws_info,
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", help="Absolute path to open-intelligent-ui checkout")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    args = parser.parse_args()
    try:
        report = run_preflight(args.workspace)
    except PreflightError as exc:
        if args.json:
            print(json.dumps({"skill": "open-intelligent-ui", "status": "error", "message": str(exc)}, indent=2))
        else:
            print(f"error: {exc}", file=sys.stderr)
        return exc.exit_code

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"open-intelligent-ui preflight: {report['status']}")
        for c in report["checks"]:
            print(f"  - {c['name']}: {c['status']} ({c['detail']})")
    return 0 if report["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
