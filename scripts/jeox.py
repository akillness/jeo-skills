#!/usr/bin/env python3
"""Thin forwarding shim for `.jeo/db/jeo.db` management.

`.jeo/db/jeo.db` is managed EXCLUSIVELY by `../jeo-code` (`packages/jeo-mem` / `jeo jeox`).
`jeo-skills` must never create, open, or mutate `.jeo/db/jeo.db` directly with SQLite.
All CLI subcommands and stdio MCP requests are delegated to `../jeo-code`.
"""
from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys


def _search_path(home: Path) -> str:
    extra = [
        str(home / ".bun/bin"),
        str(home / ".local/bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
    ]
    base = os.environ.get("PATH", "")
    parts = [p for p in extra + base.split(os.pathsep) if p]
    deduped: list[str] = []
    for p in parts:
        if p not in deduped:
            deduped.append(p)
    return os.pathsep.join(deduped)


def _extract_repo_arg(argv: list[str]) -> str | None:
    for i, token in enumerate(argv):
        if token in ("--repo", "--root") and i + 1 < len(argv):
            return argv[i + 1]
        if token.startswith("--repo="):
            return token.split("=", 1)[1]
        if token.startswith("--root="):
            return token.split("=", 1)[1]
    return os.environ.get("JEOX_REPO")


def resolve_jeo_code_command(argv: list[str], home: Path | None = None) -> list[str] | None:
    resolved_home = (home or Path.home()).expanduser().resolve()
    search_path = _search_path(resolved_home)
    bun_bin = shutil.which("bun", path=search_path)

    override = os.environ.get("JEO_CODE_ROOT")
    candidates: list[Path] = []
    if override is not None:
        raw = override.strip()
        if not raw or raw.lower() in {"none", "off", "skip"}:
            return None
        candidates.append(Path(raw).expanduser().resolve())
    else:
        repo_hint = _extract_repo_arg(argv)
        if repo_hint:
            try:
                candidates.append((Path(repo_hint).expanduser().resolve().parent / "jeo-code").resolve())
            except OSError:
                pass
        candidates.append((Path(__file__).resolve().parents[2] / "jeo-code").resolve())
        candidates.append((resolved_home / ".jeo/global/node_modules/jeo-code").resolve())

    for cand in candidates:
        mem_cli = cand / "packages/jeo-mem/src/cli.ts"
        if bun_bin and mem_cli.is_file():
            return [bun_bin, str(mem_cli), *argv]
        jeo_entry = cand / "src/cli.ts"
        if bun_bin and (cand / "src/commands/jeox.ts").is_file() and jeo_entry.is_file():
            return [bun_bin, str(jeo_entry), "jeox", *argv]

    if override is None:
        jeo_bin = shutil.which("jeo", path=search_path)
        if jeo_bin:
            try:
                pkg_root = Path(jeo_bin).resolve().parent.parent
                if (pkg_root / "src/commands/jeox.ts").is_file():
                    return [jeo_bin, "jeox", *argv]
                if bun_bin and (pkg_root / "packages/jeo-mem/src/cli.ts").is_file():
                    return [bun_bin, str(pkg_root / "packages/jeo-mem/src/cli.ts"), *argv]
            except OSError:
                pass
    return None


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if args and args[0] == "--version":
        print("jeox (delegates .jeo/db/jeo.db exclusively to ../jeo-code)")
        return 0
    cmd = resolve_jeo_code_command(args)
    if cmd is None:
        print(
            "[jeox] ERROR: .jeo/db/jeo.db is managed exclusively by ../jeo-code (jeo-mem); "
            "neither a valid jeo-code checkout/package nor bun was found. Refusing to open .jeo/db/jeo.db from jeo-skills.",
            file=sys.stderr,
        )
        return 1
    completed = subprocess.run(cmd, check=False)
    return completed.returncode


if __name__ == "__main__":
    raise SystemExit(main())
