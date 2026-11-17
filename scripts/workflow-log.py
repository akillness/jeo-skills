#!/usr/bin/env python3
"""Standalone entrypoint for the unified jeo workflow log (`jeo-flow-log`)."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

sys.dont_write_bytecode = True


def _locate_scripts_dir() -> Path:
    here = Path(__file__).resolve()
    candidates = [
        here.parent.parent / ".agent-skills/jeo-skill/scripts",
        Path(os.environ.get("SKILLS_ROOT") or (Path.home() / ".agents/skills")) / "jeo-skill/scripts",
    ]
    for cand in candidates:
        if (cand / "workflow_log_cli.py").is_file():
            return cand
    raise SystemExit("workflow_log_cli.py not found in repo or ~/.agents/skills/jeo-skill/scripts")


sys.path.insert(0, str(_locate_scripts_dir()))
import workflow_log_cli  # type: ignore  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="jeo-flow-log", description=__doc__)
    sub = parser.add_subparsers(dest="flow_command", required=True)
    workflow_log_cli._add_flow_subcommands(sub)  # noqa: SLF001
    args = parser.parse_args(argv)
    return workflow_log_cli.run(args)


if __name__ == "__main__":
    raise SystemExit(main())
