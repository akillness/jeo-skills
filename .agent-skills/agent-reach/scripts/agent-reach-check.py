#!/usr/bin/env python3
"""Offline readiness and upstream source fingerprint checker for the agent-reach skill.

A normal report is a single JSON object printed on stdout. Argument handling is left
to argparse, so `--help` and argument errors print standard argparse text (usage/help
on stdout, errors on stderr) rather than JSON.

This script never launches a command, never contacts a live channel, never writes or
installs anything, and never reads configuration or credential values. The only
environment access is the PATH lookup that shutil.which performs to report boolean
command presence.

Exit codes:
  0  report generated and no source mismatch
  1  fingerprint mismatch on at least one manifest-listed file
  2  validation or read error (including argparse argument errors)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import sys
from typing import Any, Dict, List, Optional, Tuple

SCHEMA = "agent-reach-check/1"
UPSTREAM_PYTHON_MINIMUM = (3, 10)
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_MANIFEST_BYTES = 4 * 1024 * 1024
READ_CHUNK = 65536
HEX_DIGITS = frozenset("0123456789abcdef")
MAX_RELPATH_LEN = 512

COMMANDS = (
    "agent-reach",
    "uv",
    "gh",
    "mcporter",
    "node",
    "npm",
    "deno",
    "yt-dlp",
    "ffmpeg",
    "ffprobe",
    "twitter",
    "bili",
    "rdt",
    "opencli",
)


class FileTooLarge(Exception):
    """Raised when a bounded read hits its limit. Never surfaced as text in output."""

MATCH_STATUS = "match"
MISMATCH_STATUS = "mismatch"

NOTES = (
    "command_presence is a boolean PATH lookup only; it is not readiness, version, "
    "authentication, entitlement, or capability.",
    "No live channel, endpoint, server, or account was contacted or tested by this script.",
    "Evidence matching covers the bytes of the manifest-listed files only; it does not "
    "validate the whole checkout, its dependencies, or code safety.",
)

DEFAULT_MANIFEST = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "references",
    "upstream-evidence.json",
)


def _is_hex(value: Any, length: int) -> bool:
    return (
        isinstance(value, str)
        and len(value) == length
        and all(char in HEX_DIGITS for char in value.lower())
    )


def _label(rel: Any) -> str:
    """Return a printable, length-capped label for a manifest key."""
    if not isinstance(rel, str):
        return "<non-string entry>"
    if len(rel) > 200 or not rel.isprintable():
        return "<unprintable path>"
    return rel


def safe_relpath(rel: Any) -> bool:
    """Accept only simple, relative, forward-slash paths that stay inside the root."""
    if not isinstance(rel, str) or not rel or len(rel) > MAX_RELPATH_LEN:
        return False
    if "\x00" in rel or "\\" in rel or ":" in rel:
        return False
    if rel.startswith("/") or os.path.isabs(rel):
        return False
    for part in rel.split("/"):
        if part in ("", ".", ".."):
            return False
    return True


def path_symlink_free(path: str) -> bool:
    """True when the path and every existing ancestor component is not a symlink.

    Components are walked lexically from the filesystem root down, so nothing is
    followed before the safety decision is made. This deliberately avoids realpath,
    which would resolve the very links that must be rejected.
    """
    # abspath would erase link/.. before the walk. Refuse that ambiguity first.
    lexical = path.replace(os.altsep, os.sep) if os.altsep else path
    if "\x00" in lexical or os.pardir in lexical.split(os.sep):
        return False
    absolute = os.path.abspath(path)
    drive, tail = os.path.splitdrive(absolute)
    current = drive + os.sep if tail.startswith(os.sep) else drive
    for part in tail.split(os.sep):
        if not part:
            continue
        current = os.path.join(current, part) if current else part
        if os.path.islink(current):
            return False
    return True


def symlink_free(root: str, rel: str) -> bool:
    """Reject the root itself and every ancestor and leaf component that is a symlink."""
    if os.path.islink(root):
        return False
    current = root
    for part in rel.split("/"):
        current = os.path.join(current, part)
        if os.path.islink(current):
            return False
    return True


def sha256_file(path: str, limit: int = MAX_FILE_BYTES) -> str:
    """Hash a file, reading at most limit + 1 bytes before refusing.

    The extra byte is what proves the file is over the bound, so a file that grows
    between the stat and the read cannot stream unbounded data through this process.
    """
    digest = hashlib.sha256()
    remaining = limit + 1
    with open(path, "rb") as handle:
        while remaining > 0:
            chunk = handle.read(min(READ_CHUNK, remaining))
            if not chunk:
                return digest.hexdigest()
            remaining -= len(chunk)
            if remaining <= 0:
                raise FileTooLarge()
            digest.update(chunk)
    raise FileTooLarge()


def validate_manifest(manifest: Any) -> Tuple[Optional[Dict[str, Any]], List[str]]:
    """Return (manifest, []) when structurally usable, else (None, [error codes])."""
    if not isinstance(manifest, dict):
        return None, ["manifest_not_an_object"]
    errors: List[str] = []
    if not _is_hex(manifest.get("upstream_commit"), 40):
        errors.append("invalid_upstream_commit")
    files = manifest.get("files")
    if not isinstance(files, dict) or not files:
        errors.append("empty_or_invalid_files")
    if errors:
        return None, errors
    return manifest, []


def load_manifest(path: str) -> Tuple[Optional[Any], Optional[str]]:
    """Read and parse the evidence manifest without following a symlink."""
    if not path_symlink_free(path):
        return None, "manifest_symlink_rejected"
    if not os.path.isfile(path):
        return None, "manifest_missing"
    try:
        if os.path.getsize(path) > MAX_MANIFEST_BYTES:
            return None, "manifest_oversize"
        with open(path, "rb") as handle:
            raw = handle.read(MAX_MANIFEST_BYTES + 1)
    except OSError:
        return None, "manifest_unreadable"
    if len(raw) > MAX_MANIFEST_BYTES:
        return None, "manifest_oversize"
    try:
        return json.loads(raw.decode("utf-8")), None
    except (ValueError, UnicodeDecodeError):
        return None, "manifest_invalid_json"


def check_file(root: str, rel: str, expected: Any) -> Dict[str, Any]:
    entry: Dict[str, Any] = {"path": _label(rel), "status": "", "expected_sha256": None}
    if not _is_hex(expected, 64):
        entry["status"] = "invalid_hash"
        return entry
    entry["expected_sha256"] = expected.lower()
    if not safe_relpath(rel):
        entry["status"] = "unsafe_path"
        return entry
    if not symlink_free(root, rel):
        entry["status"] = "symlink_rejected"
        return entry
    target = os.path.join(root, rel)
    if not os.path.exists(target):
        entry["status"] = "missing"
        return entry
    if not os.path.isfile(target):
        entry["status"] = "not_a_regular_file"
        return entry
    try:
        size = os.path.getsize(target)
    except OSError:
        entry["status"] = "unreadable"
        return entry
    if size > MAX_FILE_BYTES:
        entry["status"] = "oversize"
        entry["size_limit_bytes"] = MAX_FILE_BYTES
        return entry
    try:
        actual = sha256_file(target, MAX_FILE_BYTES)
    except FileTooLarge:
        entry["status"] = "oversize"
        entry["size_limit_bytes"] = MAX_FILE_BYTES
        return entry
    except OSError:
        entry["status"] = "unreadable"
        return entry
    entry["actual_sha256"] = actual
    entry["status"] = MATCH_STATUS if actual == entry["expected_sha256"] else MISMATCH_STATUS
    return entry


def check_source(root: str, manifest: Any) -> Dict[str, Any]:
    """Compare only the manifest-listed files under root. Never reads anything else."""
    report: Dict[str, Any] = {
        "upstream_commit": None,
        "declared_files": 0,
        "matched": 0,
        "mismatched": 0,
        "errored": 0,
        "manifest_errors": [],
        "files": [],
        "scope": "manifest-listed file bytes only; not a whole-checkout or code-safety review",
    }
    validated, manifest_errors = validate_manifest(manifest)
    if validated is None:
        report["manifest_errors"] = manifest_errors
        report["errored"] = len(manifest_errors)
        return report
    report["upstream_commit"] = str(validated["upstream_commit"]).lower()
    files: Dict[Any, Any] = validated["files"]
    report["declared_files"] = len(files)
    if not path_symlink_free(root):
        report["manifest_errors"] = ["source_root_symlink_rejected"]
        report["errored"] = 1
        return report
    if not os.path.isdir(root):
        report["manifest_errors"] = ["source_root_not_a_directory"]
        report["errored"] = 1
        return report
    for rel in sorted(files, key=lambda item: _label(item)):
        entry = check_file(root, rel, files[rel])
        report["files"].append(entry)
        if entry["status"] == MATCH_STATUS:
            report["matched"] += 1
        elif entry["status"] == MISMATCH_STATUS:
            report["mismatched"] += 1
        else:
            report["errored"] += 1
    return report


def host_report() -> Dict[str, Any]:
    version = sys.version_info
    return {
        "python_version": "%d.%d.%d" % (version.major, version.minor, version.micro),
        "python_meets_upstream_minimum": (version.major, version.minor) >= UPSTREAM_PYTHON_MINIMUM,
        "upstream_python_minimum": "%d.%d" % UPSTREAM_PYTHON_MINIMUM,
        "upstream_python_minimum_source": "pinned-pyproject",
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
        },
        "command_presence": {name: shutil.which(name) is not None for name in COMMANDS},
    }


def build_report(source: Optional[str], manifest_path: str) -> Tuple[Dict[str, Any], int]:
    report: Dict[str, Any] = {
        "schema": SCHEMA,
        "host": host_report(),
        "notes": list(NOTES),
        "live_channels_tested": False,
        "source_check": None,
    }
    exit_code = 0
    if source is not None:
        manifest, manifest_error = load_manifest(manifest_path)
        if manifest_error is not None:
            report["source_check"] = {
                "upstream_commit": None,
                "declared_files": 0,
                "matched": 0,
                "mismatched": 0,
                "errored": 1,
                "manifest_errors": [manifest_error],
                "files": [],
                "scope": "manifest-listed file bytes only; not a whole-checkout or code-safety review",
            }
            exit_code = 2
        else:
            source_check = check_source(source, manifest)
            report["source_check"] = source_check
            if source_check["errored"]:
                exit_code = 2
            elif source_check["mismatched"]:
                exit_code = 1
    report["status"] = {0: "ok", 1: "mismatch", 2: "error"}[exit_code]
    report["exit_code"] = exit_code
    return report, exit_code


def parse_args(argv: Optional[List[str]]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="agent-reach-check",
        description=(
            "Offline readiness and upstream source fingerprint checker. "
            "Runs no commands and contacts no live channel."
        ),
    )
    parser.add_argument(
        "--source",
        metavar="PATH",
        default=None,
        help="Checkout root to fingerprint against the evidence manifest.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    report, exit_code = build_report(args.source, DEFAULT_MANIFEST)
    sys.stdout.write(json.dumps(report, indent=2, sort_keys=True) + "\n")
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
