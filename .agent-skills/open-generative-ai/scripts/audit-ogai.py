#!/usr/bin/env python3
"""Read-only Open Generative AI source, model-catalog, and release auditor.

The script never runs npm/next/electron/docker, never builds, downloads, or
launches anything, never makes a network request, and never prints an API key
or the contents of an env file. It reads Git metadata and targeted text files.

Verified against Anil-matcha/Open-Generative-AI commit
5482a777047c0df189eef989ff994d0d7a1d2874 (package.json version 2.0.0).

Exit codes:
  0  PASS or WARN
  1  usage/input error
  2  BLOCKED integrity result
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

PACK = "open-generative-ai"
PINNED_COMMIT = "5482a777047c0df189eef989ff994d0d7a1d2874"
PINNED_VERSION = "2.0.0"
EXPECTED_ORIGINS = {
    "https://github.com/Anil-matcha/Open-Generative-AI",
    "https://github.com/Anil-matcha/Open-Generative-AI.git",
    "git@github.com:Anil-matcha/Open-Generative-AI.git",
}
EXPECTED_SUBMODULES = {
    "packages/Vibe-Workflow",
    "packages/Open-Poe-AI",
    "packages/Open-AI-Design-Agent",
}
MODEL_ARRAYS = (
    "t2iModels",
    "t2vModels",
    "i2iModels",
    "i2vModels",
    "v2vModels",
    "lipsyncModels",
    "recastModels",
    "audioModels",
)
# Counted at the audited pin. Drift is informational, not a failure.
PINNED_MODEL_TOTAL = 354
SECRET_KEY = re.compile(
    r"(?i)(api.?key|token|secret|password|credential|access.?key|authorization)"
)
MODELS_REL = "packages/studio/src/models.js"


def read_text(path: Path) -> str:
    if not path.is_file() or path.is_symlink():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def git(root: Path, *args: str) -> str:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    try:
        result = subprocess.run(
            ["git", "-C", str(root), *args],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=5,
            env=env,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


class Report:
    def __init__(self, mode: str) -> None:
        self.mode = mode
        self.facts: dict[str, Any] = {}
        self.warnings: list[str] = []
        self.blockers: list[str] = []

    def fact(self, key: str, value: Any) -> None:
        self.facts[key] = value

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def block(self, message: str) -> None:
        self.blockers.append(message)

    @property
    def status(self) -> str:
        if self.blockers:
            return "BLOCKED"
        if self.warnings:
            return "WARN"
        return "PASS"

    def exit_code(self) -> int:
        return 2 if self.blockers else 0

    def emit(self, fmt: str) -> None:
        if fmt == "json":
            print(
                json.dumps(
                    {
                        "pack": PACK,
                        "mode": self.mode,
                        "status": self.status,
                        "facts": self.facts,
                        "warnings": self.warnings,
                        "blockers": self.blockers,
                    },
                    indent=2,
                    ensure_ascii=False,
                )
            )
            return
        print(f"[{PACK}] mode={self.mode} status={self.status}")
        for key, value in self.facts.items():
            print(f"  - {key}: {value}")
        for message in self.warnings:
            print(f"  WARN: {message}")
        for message in self.blockers:
            print(f"  BLOCKED: {message}")


def load_json(path: Path) -> dict[str, Any] | None:
    raw = read_text(path)
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def parse_gitmodules(text: str) -> set[str]:
    return {
        match.group(1).strip()
        for match in re.finditer(r"(?m)^\s*path\s*=\s*(.+)$", text)
    }


def count_model_arrays(source: str) -> dict[str, int]:
    """Count entries per exported model array by locating each array's slice."""
    starts = [
        (match.group(1), match.end() - 1)
        for match in re.finditer(r"export const (\w+)\s*=\s*\[", source)
    ]
    counts: dict[str, int] = {}
    for index, (name, start) in enumerate(starts):
        end = starts[index + 1][1] if index + 1 < len(starts) else len(source)
        segment = source[start:end]
        entries = len(re.findall(r'"endpoint"\s*:', segment))
        if entries:
            counts[name] = entries
    return counts


def audit_source(args: argparse.Namespace) -> Report:
    report = Report("source")
    root = Path(args.repo).expanduser().resolve()
    if not root.is_dir():
        raise SystemExit(f"error: repo path not found: {root}")

    origin = git(root, "remote", "get-url", "origin")
    head = git(root, "rev-parse", "HEAD")
    dirty = git(root, "status", "--porcelain")

    report.fact("repo", str(root))
    report.fact("origin", origin or "unknown")
    report.fact("head", head or "unknown")
    report.fact("dirty", bool(dirty))

    if origin and origin not in EXPECTED_ORIGINS:
        report.block(f"origin is not the expected upstream: {origin}")
    if not head:
        report.warn("not a git checkout; cannot verify commit provenance")
    expected = args.expect_commit
    if expected and head and head != expected:
        report.warn(f"HEAD {head[:12]} differs from expected {expected[:12]}")
    if dirty:
        report.warn("working tree has uncommitted changes; claims may not match HEAD")

    pkg = load_json(root / "package.json")
    if pkg is None:
        report.block("package.json missing or unparseable")
    else:
        version = str(pkg.get("version", ""))
        report.fact("declared_version", version or "unknown")
        report.fact("license", pkg.get("license", "unknown"))
        workspaces = pkg.get("workspaces") or []
        report.fact("workspace_count", len(workspaces))
        if pkg.get("license") != "MIT":
            report.warn(f"license is {pkg.get('license')!r}, expected MIT")
        if version and version != PINNED_VERSION:
            report.warn(
                f"declared version {version} differs from audited pin {PINNED_VERSION}"
            )
        scripts = pkg.get("scripts") or {}
        if "setup" not in scripts:
            report.warn("no `setup` script; submodule+build bootstrap may have moved")

    if not (root / "LICENSE").is_file():
        report.warn("LICENSE file absent")

    declared = parse_gitmodules(read_text(root / ".gitmodules"))
    report.fact("submodules_declared", sorted(declared))
    missing = EXPECTED_SUBMODULES - declared
    if missing:
        report.warn(f"expected submodules not declared: {sorted(missing)}")
    uninitialized = [
        path
        for path in sorted(declared)
        if not any((root / path).iterdir()) if (root / path).is_dir()
    ]
    absent = [path for path in sorted(declared) if not (root / path).is_dir()]
    if uninitialized or absent:
        report.fact("submodules_not_checked_out", uninitialized + absent)
        report.warn(
            "submodules declared but not checked out; run "
            "`git submodule update --init --recursive` before building"
        )

    readme = read_text(root / "README.md")
    if readme:
        versions = sorted(set(re.findall(r"/releases/download/(v[\d.]+)/", readme)))
        if versions:
            report.fact("readme_download_versions", versions)
            if pkg and str(pkg.get("version", "")) not in {
                value.lstrip("v") for value in versions
            }:
                report.warn(
                    f"README download links {versions} disagree with package.json "
                    f"version {pkg.get('version')}; resolve releases from the API"
                )
        claims = sorted(set(re.findall(r"(\d{3,4})\+\s*(?:state-of-the-art\s*)?models", readme)))
        if claims:
            report.fact("readme_model_claims", claims)
            if len(claims) > 1:
                report.warn(
                    f"README states conflicting model counts {claims}; "
                    "count the catalog instead"
                )

    compose = read_text(root / "docker-compose.yml")
    ports = re.findall(r'"(\d+):(\d+)"', compose)
    if ports:
        report.fact("docker_port_mappings", [f"{h}->{c}" for h, c in ports])

    return report


def audit_models(args: argparse.Namespace) -> Report:
    report = Report("models")
    root = Path(args.repo).expanduser().resolve()
    models_path = root / MODELS_REL
    source = read_text(models_path)
    if not source:
        raise SystemExit(f"error: catalog not readable: {models_path}")

    counts = count_model_arrays(source)
    total = sum(counts.values())
    report.fact("catalog_path", MODELS_REL)
    report.fact("arrays", counts)
    report.fact("total_models", total)
    report.fact("generated_from_dump", "Auto-generated from models_dump.json" in source)

    for name in MODEL_ARRAYS:
        if name not in counts:
            report.warn(f"expected model array missing: {name}")
    if total != PINNED_MODEL_TOTAL:
        report.warn(
            f"catalog has {total} entries; audited pin had {PINNED_MODEL_TOTAL}. "
            "Re-derive any count you quote."
        )

    if args.endpoint:
        pattern = re.compile(
            r'"endpoint"\s*:\s*"' + re.escape(args.endpoint) + r'"'
        )
        found = bool(pattern.search(source))
        report.fact("endpoint_query", args.endpoint)
        report.fact("endpoint_found", found)
        if not found:
            report.warn(
                f"endpoint {args.endpoint!r} is not in the catalog; "
                "do not promise it to a user"
            )
        else:
            owner = None
            for name, start in [
                (m.group(1), m.end() - 1)
                for m in re.finditer(r"export const (\w+)\s*=\s*\[", source)
            ]:
                if pattern.search(source[start:]):
                    owner = name
            report.fact("endpoint_last_array_match", owner or "unknown")

    return report


def audit_release(args: argparse.Namespace) -> Report:
    report = Report("release")
    path = Path(args.metadata).expanduser().resolve()
    payload = load_json(path)
    if payload is None:
        raise SystemExit(f"error: release metadata not readable as JSON: {path}")

    tag = payload.get("tag_name", "unknown")
    report.fact("tag", tag)
    report.fact("published_at", payload.get("published_at", "unknown"))
    report.fact("prerelease", bool(payload.get("prerelease")))

    assets = payload.get("assets") or []
    names = [asset.get("name", "") for asset in assets if isinstance(asset, dict)]
    report.fact("asset_count", len(names))
    if not names:
        report.block("release metadata contains no assets")
        return report

    system, arch = args.os.lower(), args.arch.lower()
    if system == "darwin":
        wanted = [n for n in names if n.endswith(".dmg")]
        if arch in {"arm64", "aarch64"}:
            wanted = [n for n in wanted if "arm64" in n] or wanted
        else:
            wanted = [n for n in wanted if "arm64" not in n] or wanted
    elif system == "windows":
        wanted = [n for n in names if n.endswith(".exe")]
    elif system == "linux":
        wanted = [n for n in names if n.endswith((".AppImage", ".deb", ".rpm"))]
    else:
        raise SystemExit(f"error: unsupported --os value: {args.os}")

    report.fact("candidates", wanted)
    if not wanted:
        report.block(f"no asset matches os={system} arch={arch}")
        return report
    if len(wanted) > 1:
        report.warn("multiple candidate assets; choose one deliberately")

    if not any(re.search(r"(?i)(checksum|sha256|\.sig|\.asc)", name) for name in names):
        report.warn(
            "no checksum or signature asset published; verify the download origin "
            "and expect an unsigned-binary warning at first launch"
        )
    if system == "darwin":
        report.warn(
            "macOS build is not notarized; first launch requires an explicit "
            "Gatekeeper override the user should perform"
        )
    if system == "linux":
        report.warn(
            "prefer the .deb (ships a scoped AppArmor profile) over the AppImage, "
            "which may need a machine-wide userns sysctl change"
        )

    report.warn("selection is advisory; downloading and running the asset needs approval")
    return report


def build_parser() -> argparse.ArgumentParser:
    # `--format` is accepted both before and after the subcommand so documented
    # examples work in the order people actually type them.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--format",
        choices=("text", "json"),
        default=argparse.SUPPRESS,
        help="output format (default: text)",
    )

    parser = argparse.ArgumentParser(
        prog="audit-ogai.py",
        description="Read-only auditor for Anil-matcha/Open-Generative-AI.",
        parents=[common],
    )
    sub = parser.add_subparsers(dest="mode", required=True)

    source = sub.add_parser(
        "source", help="audit a local checkout", parents=[common]
    )
    source.add_argument("--repo", required=True)
    source.add_argument("--expect-commit", default=PINNED_COMMIT)
    source.set_defaults(func=audit_source)

    models = sub.add_parser(
        "models", help="count the shipped model catalog", parents=[common]
    )
    models.add_argument("--repo", required=True)
    models.add_argument("--endpoint", help="verify one endpoint id exists")
    models.set_defaults(func=audit_models)

    release = sub.add_parser(
        "release", help="plan one asset from saved release JSON", parents=[common]
    )
    release.add_argument("--metadata", required=True)
    release.add_argument("--os", required=True, choices=("darwin", "windows", "linux"))
    release.add_argument("--arch", default="x64")
    release.set_defaults(func=audit_release)

    return parser


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    report = args.func(args)
    # SUPPRESS keeps an unspecified --format out of the namespace entirely, so a
    # subcommand-level flag never clobbers one given before the subcommand.
    report.emit(getattr(args, "format", "text"))
    return report.exit_code()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
