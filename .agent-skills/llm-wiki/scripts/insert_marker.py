#!/usr/bin/env python3
"""Insert a markdown line before an <!-- MARKER:END --> anchor if absent."""

from pathlib import Path
import sys


def main() -> int:
    if len(sys.argv) != 4:
        raise SystemExit("Usage: insert_marker.py <file> <marker> <line>")
    path = Path(sys.argv[1])
    marker = sys.argv[2]
    line = sys.argv[3]
    text = path.read_text(encoding="utf-8")
    anchor = "<!-- " + marker + ":END -->"
    if line in text:
        return 0
    if anchor not in text:
        text = text.rstrip() + "\n\n" + line + "\n"
    else:
        text = text.replace(anchor, line + "\n" + anchor)
    path.write_text(text, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
