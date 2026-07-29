#!/usr/bin/env python3
"""Copy an asset unchanged and emit a SHA-256 manifest."""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path


def digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("asset", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("vfx-backups"))
    args = parser.parse_args()
    source = args.asset.resolve()
    if not source.is_file():
        print(f"asset is not a file: {source}", file=sys.stderr)
        return 2
    args.output_dir.mkdir(parents=True, exist_ok=True)
    target = args.output_dir / source.name
    if target.exists():
        print(f"refusing to overwrite existing backup: {target}", file=sys.stderr)
        return 2
    shutil.copy2(source, target)
    source_hash = digest(source)
    target_hash = digest(target)
    if source_hash != target_hash:
        print("backup hash mismatch", file=sys.stderr)
        return 1
    manifest = args.output_dir / "manifest.json"
    entries = []
    if manifest.exists():
        try:
            entries = json.loads(manifest.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            print(f"invalid existing manifest: {manifest}", file=sys.stderr)
            return 2
    if not isinstance(entries, list):
        print("manifest must contain an array", file=sys.stderr)
        return 2
    entries.append({"source": str(source), "backup": str(target), "sha256": source_hash, "bytes": source.stat().st_size, "created_at": datetime.now(timezone.utc).isoformat()})
    manifest.write_text(json.dumps(entries, indent=2) + "\n", encoding="utf-8")
    print(f"backed up {source} -> {target}")
    print(f"sha256 {source_hash}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
