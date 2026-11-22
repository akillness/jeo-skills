#!/usr/bin/env python3
"""Check Python source syntax without writing __pycache__ files."""

from __future__ import annotations

import sys
from pathlib import Path


def main(argv: list[str]) -> int:
    failed = False
    for raw_path in argv:
        path = Path(raw_path)
        try:
            source = path.read_text(encoding="utf-8")
            compile(source, str(path), "exec")
        except SyntaxError as exc:
            failed = True
            print(f"{path}:{exc.lineno}:{exc.offset}: {exc.msg}", file=sys.stderr)
        except OSError as exc:
            failed = True
            print(f"{path}: {exc}", file=sys.stderr)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
