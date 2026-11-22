#!/usr/bin/env python3
"""Package a validated ChatGPT pet and optionally install it into Codex.

  make     package/<id>/pet.json + the checked sheet bytes, package/spritesheet-v1.png
           (rows 0-8, the size ChatGPT web upload documents), and the two GIFs
  install  copy package/<id>/ to ${CODEX_HOME:-~/.codex}/pets/<id>/, backing up a pet already there
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pet_check  # noqa: E402
import pet_common as pc  # noqa: E402


def pet_dir(parent: Path, pet_id: str) -> Path:
    # An id can come from a pet.json someone else wrote; install --force deletes this folder.
    if pet_id in ("", ".", "..") or Path(pet_id).name != pet_id or "\\" in pet_id or "\0" in pet_id:
        pc.fail(f"pet id {pet_id!r} must be a single folder name, with no / or ..")
    path = parent / pet_id
    if path.resolve().parent != parent.resolve():
        pc.fail(f"{path} resolves outside {parent}; refusing to write or replace it")
    return path


def cmd_make(args) -> int:
    run = Path(args.run)
    req = pc.read_json(run / "request.json")
    sheet = Path(args.sheet) if args.sheet else run / "final" / "spritesheet.webp"
    report = pc.read_json(args.check or run / "qa" / "check.json")
    data = sheet.read_bytes()
    if not report.get("ok"):
        pc.fail("the check report has errors; fix the sheet and re-run pet_check.py")
    if report.get("sha256") != hashlib.sha256(data).hexdigest():
        pc.fail(f"the check report is for other bytes than {sheet.name}; re-run pet_check.py on this exact file")
    pet_id = args.id or req["pet_id"]
    folder = pet_dir(run / "package", pet_id)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"spritesheet{sheet.suffix.lower()}"
    target.write_bytes(data)
    manifest = {
        "id": pet_id,
        "displayName": args.name or req["display_name"],
        "description": args.description or req["description"],
        "spritesheetPath": target.name,
    }
    pc.write_json(folder / "pet.json", manifest)

    v1 = run / "package" / "spritesheet-v1.png"
    pc.save_png(pc.load_rgba(sheet)[: pc.SHEET_SIZES[1][1]], v1)
    key = req.get("chroma_key", {}).get("hex")
    v1_report = pet_check.check(v1, pc.parse_key(key) if key else None, structure_only=True)
    if not v1_report["ok"]:
        pc.fail(f"the v1 cut failed its check: {'; '.join(v1_report['errors'])}")
    copied, missing = [], []
    for name in ("pet.gif", "pet-transparent.gif"):
        source = run / "previews" / name
        if source.exists():
            shutil.copy2(source, run / "package" / name)
            copied.append(name)
        else:
            missing.append(name)
    result = {"ok": True, "package": str(folder), "pet": manifest, "v1": str(v1), "gifs": copied}
    if missing:
        result["warnings"] = [f"{name} not found in previews/; run pet_preview.py gif first" for name in missing]
    print(json.dumps(result))
    return 0


def cmd_install(args) -> int:
    run = Path(args.run)
    pet_id = args.id or pc.read_json(run / "request.json")["pet_id"]
    source = pet_dir(run / "package", pet_id)
    if not (source / "pet.json").exists():
        pc.fail(f"{source} has no pet.json; run pet_package.py make first")
    home = Path(args.codex_home or os.environ.get("CODEX_HOME") or Path.home() / ".codex")
    target = pet_dir(home / "pets", pet_id)
    backup = None
    if target.exists():
        if not args.force:
            pc.fail(f"{target} already exists; ask before replacing it, then re-run with --force (it is backed up first)")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        backup = run / "package" / f"backup-{pet_id}-{stamp}"
        shutil.copytree(target, backup)
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(source, target)
    print(json.dumps({"ok": True, "installed": str(target), "backup": str(backup) if backup else None}))
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    make = sub.add_parser("make", help="write the package next to the run")
    make.add_argument("run")
    make.add_argument("--sheet", help="the checked sheet (default <run>/final/spritesheet.webp)")
    make.add_argument("--check", help="its pet_check.py report (default <run>/qa/check.json)")
    make.add_argument("--id", help="pet id; keep an updated pet's original id")
    make.add_argument("--name")
    make.add_argument("--description")
    make.set_defaults(func=cmd_make)
    install = sub.add_parser("install", help="copy the package into Codex")
    install.add_argument("run")
    install.add_argument("--id")
    install.add_argument("--codex-home", help="default $CODEX_HOME or ~/.codex")
    install.add_argument("--force", action="store_true", help="replace an installed pet with the same id")
    install.set_defaults(func=cmd_install)
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
