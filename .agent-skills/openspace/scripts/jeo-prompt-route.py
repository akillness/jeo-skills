#!/usr/bin/env python3
# @openspace-route-managed
"""Run Jeo's advisory skill routers sequentially on the same pre-prompt event."""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path


def run(argv: list[str], event: bytes, timeout: float) -> str:
    try:
        result = subprocess.run(argv, input=event, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, timeout=timeout, check=True)
        return result.stdout.decode("utf-8").strip()
    except (OSError, subprocess.SubprocessError, UnicodeError):
        return ""


def openspace_context(stdout: str) -> str:
    try:
        context = json.loads(stdout)["hookSpecificOutput"]["additionalContext"]
    except (ValueError, TypeError, KeyError):
        return ""
    return context.strip() if isinstance(context, str) else ""


def main() -> None:
    wrapper, plugin, jev_timeout, openspace_timeout = sys.argv[1:]
    event = sys.stdin.buffer.read()
    node = shutil.which("node") if Path(plugin).is_file() else None
    jev = run([node, plugin, "jeo-preprompt-local", "--agent", "jeo"], event, float(jev_timeout)) if node else ""
    openspace = openspace_context(run(["/bin/sh", wrapper, "jeo"], event, float(openspace_timeout)))
    context = "\n\n".join(part for part in (jev, openspace) if part)
    if context:
        print(json.dumps({"additionalContext": context}))


if __name__ == "__main__":
    main()
