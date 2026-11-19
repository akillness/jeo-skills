#!/usr/bin/env python3
"""Offline environment, model-cache, and input preflight helper for indra (indra-ocr); never downloads weights, makes network calls, or spawns processes."""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys

BLOCKED_PARTS = {".git", ".ssh", ".aws", ".azure", ".config", ".netrc", ".npmrc", ".pypirc"}
SENSITIVE_STEMS = {"credential", "credentials", "secret", "secrets", "password", "token", "api_key", "apikey"}
SUPPORTED_EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"}


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


def run_preflight(input_arg: str | None = None, model_dir_arg: str | None = None) -> dict:
    py_ok = sys.version_info >= (3, 10)
    cli_bin = shutil.which("indra-ocr")
    viewer_bin = shutil.which("indra-ocr-viewer")
    tesseract_bin = shutil.which("tesseract")
    pkg_installed = importlib.util.find_spec("indra_ocr") is not None

    env_model_dir = os.environ.get("INDRA_OCR_MODEL_DIR")
    chosen_model_dir = model_dir_arg or env_model_dir
    model_dir_info = None
    if chosen_model_dir:
        md = validate_safe_path(chosen_model_dir, must_exist=True, must_dir=True)
        onnx_files = sorted(f.name for f in md.iterdir() if f.is_file() and f.suffix == ".onnx")
        model_dir_info = {"path": str(md), "onnx_count": len(onnx_files), "onnx_files": onnx_files[:20]}

    input_info = None
    if input_arg is not None:
        inp = validate_safe_path(input_arg, must_exist=True, must_file=True)
        ext = inp.suffix.lower()
        if ext not in SUPPORTED_EXTS:
            raise PreflightError(f"unsupported input extension {ext!r}; expected one of {sorted(SUPPORTED_EXTS)}", 2)
        input_info = {"path": str(inp), "extension": ext, "size_bytes": inp.stat().st_size}

    checks = [
        {"name": "python>=3.10", "status": "ok" if py_ok else "missing", "detail": sys.version.split()[0]},
        {"name": "indra-ocr-cli", "status": "ok" if cli_bin else "missing", "detail": cli_bin or "not found in PATH"},
        {"name": "indra_ocr-pkg", "status": "ok" if pkg_installed else "missing", "detail": "importable" if pkg_installed else "pip install indra-ocr"},
        {"name": "tesseract-optional", "status": "ok" if tesseract_bin else "info", "detail": tesseract_bin or "optional viewer comparison only"},
    ]
    if model_dir_info is not None:
        checks.append({
            "name": "model-dir",
            "status": "ok" if model_dir_info["onnx_count"] > 0 else "info",
            "detail": f"{model_dir_info['onnx_count']} .onnx files",
        })

    ready = bool(py_ok and (cli_bin or pkg_installed))
    return {
        "skill": "indra",
        "scope": "offline-preflight",
        "status": "ready" if ready else "blocked",
        "runtime_verified": False,
        "cli": {"indra_ocr": cli_bin, "indra_ocr_viewer": viewer_bin, "tesseract": tesseract_bin},
        "package_installed": pkg_installed,
        "model_dir": model_dir_info,
        "input": input_info,
        "checks": checks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", help="Absolute path to input PDF or image file")
    parser.add_argument("--model-dir", help="Absolute path to local Indra OCR model folder")
    parser.add_argument("--json", action="store_true", help="Emit JSON report")
    args = parser.parse_args()
    try:
        report = run_preflight(args.input, args.model_dir)
    except PreflightError as exc:
        if args.json:
            print(json.dumps({"skill": "indra", "status": "error", "message": str(exc)}, indent=2))
        else:
            print(f"error: {exc}", file=sys.stderr)
        return exc.exit_code

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"indra preflight: {report['status']}")
        for c in report["checks"]:
            print(f"  - {c['name']}: {c['status']} ({c['detail']})")
    return 0 if report["status"] == "ready" else 1


if __name__ == "__main__":
    sys.exit(main())
