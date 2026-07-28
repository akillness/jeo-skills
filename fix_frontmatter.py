#!/usr/bin/env python3
"""Deprecated entry point — delegates to scripts/repair-skill-frontmatter.py.

The previous implementation parsed frontmatter line by line with
`re.match(r'^(\\w[\\w-]*)\\s*:\\s*(.*)', line)`, which cannot see YAML block
scalars. For the standard shape used throughout this catalog

    description: >-
      Packet-first BMAD/BMM front door for idea notes, product briefs, …

it captured the value as the literal indicator `">-"`, then rewrote the file as
`description: ">-"` and dropped every continuation line. The same happened to
`compatibility:`. That is how 26 skills ended up shipping a one-character
description that no agent could ever match on, and this script ran in CI on every
pull request, so each run re-introduced the damage.

`scripts/repair-skill-frontmatter.py` does the intended job correctly: it parses
with PyYAML, recovers a real description from skills.toon / the manifest / the
setup keyword table / the document body, rewrites only broken entries as folded
block scalars, leaves healthy documents byte-identical, and offers `--check` as a
fail-closed audit for CI.

This shim stays so existing invocations keep working instead of silently
corrupting the catalog. Use the replacement directly in new automation.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPLACEMENT = Path(__file__).resolve().parent / "scripts" / "repair-skill-frontmatter.py"


def main() -> int:
    if not REPLACEMENT.is_file():
        print(f"❌ replacement script missing: {REPLACEMENT}", file=sys.stderr)
        return 2

    print(
        "⚠️  fix_frontmatter.py is deprecated — it destroyed folded YAML descriptions.\n"
        f"   Delegating to {REPLACEMENT.relative_to(Path(__file__).resolve().parent)}"
        " (add --check for a read-only audit).",
        file=sys.stderr,
    )
    return subprocess.call([sys.executable, str(REPLACEMENT), *sys.argv[1:]])


if __name__ == "__main__":
    raise SystemExit(main())
