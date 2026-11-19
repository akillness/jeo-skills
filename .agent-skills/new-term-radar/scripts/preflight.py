#!/usr/bin/env python3
"""Offline environment, config.json, and env-var-presence preflight helper for new-term-radar; never prints secrets, makes network calls, or spawns processes."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import sys

BLOCKED_PARTS = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "token", "api_key", "apikey"}

ENV_NAMES = (
    "AISA_API_KEY",
    "GOANYAPI_API_KEY",
    "TRUSTMRR_API_KEY",
    "GITHUB_TOKEN",
    "RESEND_API_KEY",
    "RADAR_CONFIG",
    "RADAR_STATE",
)

KNOWN_CONFIG_KEYS = {
    "lang", "x_accounts", "sitemaps", "topics", "known_terms", "stop_words",
    "judge", "breakout", "new_sites", "review", "usecases", "word_age",
    "markets", "serp_shape", "yours", "year_curve", "dot_com", "ai_answers", "gsc",
}


class PreflightError(Exception):
    def __init__(self, message: str, exit_code: int = 2):
        super().__init__(message)
        self.exit_code = exit_code


def validate_safe_path(raw_path: str, must_exist: bool = True, must_file: bool = False, must_dir: bool = False) -> Path:
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
    if must_file and resolved.exists() and not resolved.is_file():
        raise PreflightError(f"expected file path: {resolved}", 2)
    if must_dir and resolved.exists() and not resolved.is_dir():
        raise PreflightError(f"expected directory path: {resolved}", 2)
    return resolved


def inspect_config(cfg_path: Path) -> dict:
    try:
        data = json.loads(cfg_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise PreflightError(f"invalid JSON in config {cfg_path}: {exc}", 2) from exc
    if not isinstance(data, dict):
        raise PreflightError(f"config root must be JSON object: {cfg_path}", 2)

    keys = sorted(data.keys())
    known = [k for k in keys if k in KNOWN_CONFIG_KEYS]
    sitemaps = data.get("sitemaps")
    x_accounts = data.get("x_accounts")
    ai_answers = data.get("ai_answers")
    return {
        "path": str(cfg_path),
        "lang": data.get("lang"),
        "known_sections": known,
        "sitemap_count": len(sitemaps) if isinstance(sitemaps, list) else 0,
        "has_x_accounts": isinstance(x_accounts, dict) and bool(x_accounts),
        "ai_answers_enabled": bool(isinstance(ai_answers, dict) and ai_answers.get("enabled")),
    }


def run_preflight(config_arg: str | None = None, state_arg: str | None = None) -> dict:
    py_ok = sys.version_info >= (3, 10)
    uv_bin = shutil.which("uv")
    uvx_bin = shutil.which("uvx")
    cli_bin = shutil.which("new-term-radar")
    mcp_bin = shutil.which("new-term-radar-mcp")

    # Report boolean presence only — never capture or return secret values
    env_set = {name: bool(os.environ.get(name)) for name in ENV_NAMES}

    cfg_info = None
    if config_arg is not None:
        cfg_path = validate_safe_path(config_arg, must_exist=True, must_file=True)
        cfg_info = inspect_config(cfg_path)

    state_info = None
    if state_arg is not None:
        st_path = validate_safe_path(state_arg, must_exist=False, must_dir=True)
        state_info = {
            "path": str(st_path),
            "exists": st_path.is_dir(),
        }

    checks = [
        {"name": "python>=3.10", "status": "ok" if py_ok else "missing", "detail": sys.version.split()[0]},
        {"name": "uvx-or-cli", "status": "ok" if (uvx_bin or cli_bin) else "missing", "detail": uvx_bin or cli_bin or "install uv or new-term-radar"},
        {"name": "aisa-key", "status": "ok" if env_set["AISA_API_KEY"] else "info", "detail": "set (paid signals ready)" if env_set["AISA_API_KEY"] else "unset (free signals only: HF, GitHub, sitemaps, GSC)"},
        {"name": "goanyapi-key", "status": "ok" if env_set["GOANYAPI_API_KEY"] else "info", "detail": "set" if env_set["GOANYAPI_API_KEY"] else "unset (related queries and one-country curves off)"},
    ]
    if cfg_info is not None:
        checks.append({
            "name": "config.json",
            "status": "ok",
            "detail": f"{len(cfg_info['known_sections'])} known sections, {cfg_info['sitemap_count']} sitemaps",
        })

    ready = bool(py_ok and (uvx_bin or cli_bin))
    return {
        "skill": "new-term-radar",
        "scope": "offline-preflight",
        "status": "ready" if ready else "blocked",
        "runtime_verified": False,
        "cli": {"uv": uv_bin, "uvx": uvx_bin, "new_term_radar": cli_bin, "new_term_radar_mcp": mcp_bin},
        "env_keys_set": env_set,
        "config": cfg_info,
        "state": state_info,
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", help="Absolute path to new-term-radar config.json")
    parser.add_argument("--state", help="Absolute path to state directory")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    args = parser.parse_args()
    try:
        report = run_preflight(args.config, args.state)
    except PreflightError as exc:
        if args.json:
            print(json.dumps({"skill": "new-term-radar", "status": "error", "message": str(exc)}, indent=2))
        else:
            print(f"error: {exc}", file=sys.stderr)
        return exc.exit_code

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"new-term-radar preflight: {report['status']}")
        for c in report["checks"]:
            print(f"  - {c['name']}: {c['status']} ({c['detail']})")
    return 0 if report["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
