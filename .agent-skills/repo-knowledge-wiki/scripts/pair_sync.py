#!/usr/bin/env python3
"""Audit and sync pairings between knowledge/ documents and .mex/context/knowledge-pairings.md."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)
DOC_REF_RE = re.compile(r"knowledge/[A-Za-z0-9_./-]+\.md")


def parse_simple_frontmatter(text: str) -> dict[str, object]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}
    data: dict[str, object] = {}
    current_list_key: str | None = None
    for raw in m.group(1).splitlines():
        line = raw.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue
        if current_list_key and line.startswith("  - "):
            data[current_list_key].append(line[4:].strip())  # type: ignore[union-attr]
            continue
        current_list_key = None
        if ":" in line and not line.startswith(" "):
            key, val = line.split(":", 1)
            key = key.strip()
            val = val.strip()
            if val == "":
                data[key] = []
                current_list_key = key
            else:
                data[key] = val.strip("'\"")
    return data


def first_heading(text: str) -> str:
    body = FRONTMATTER_RE.sub("", text, count=1)
    for line in body.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def parse_symbol_ref(spec: str) -> dict[str, object] | None:
    if "#" in spec:
        file_part, sym_part = spec.split("#", 1)
        if file_part and sym_part:
            return {"file": file_part, "symbol": sym_part}
    if ":" in spec:
        file_part, line_part = spec.rsplit(":", 1)
        if file_part and line_part.isdigit():
            return {"file": file_part, "line": int(line_part)}
    return None


def format_symbol_for_markdown(spec: str) -> str:
    if "#" in spec:
        file_part, sym_part = spec.split("#", 1)
        return f"`{file_part}` (`{sym_part}`)"
    if ":" in spec:
        file_part, line_part = spec.rsplit(":", 1)
        if line_part.isdigit():
            return f"`{file_part}` (line {line_part})"
    return f"`{spec}`"


def doc_kind_from_path(rel: str) -> str:
    parts = rel.split("/")
    if len(parts) >= 2 and parts[1] in ("queries", "work", "concepts"):
        return parts[1].rstrip("s") if parts[1] != "work" else "work"
    return "note"


def audit_pairings(project: Path) -> dict:
    knowledge_dir = project / "knowledge"
    pairings_file = project / ".mex/context/knowledge-pairings.md"

    paired_in_mex: set[str] = set()
    if pairings_file.is_file():
        paired_in_mex.update(DOC_REF_RE.findall(pairings_file.read_text(encoding="utf-8")))

    docs: list[dict] = []
    unpaired_with_symbols: list[str] = []
    missing_refs_in_mex: list[str] = []

    if knowledge_dir.is_dir():
        for md in sorted(knowledge_dir.rglob("*.md")):
            rel = md.relative_to(project).as_posix()
            if rel in ("knowledge/index.md", "knowledge/log.md") or rel.startswith("knowledge/raw/"):
                continue
            text = md.read_text(encoding="utf-8")
            fm = parse_simple_frontmatter(text)
            symbols = fm.get("paired_symbols", [])
            if not isinstance(symbols, list):
                symbols = []
            status = str(fm.get("status", "unknown"))
            title = first_heading(text) or md.stem
            in_mex = rel in paired_in_mex
            if symbols and not in_mex and status != "archived":
                unpaired_with_symbols.append(rel)
            docs.append({
                "path": rel,
                "title": title,
                "kind": str(fm.get("type") or doc_kind_from_path(rel)),
                "status": status,
                "paired_symbols": symbols,
                "bridged_in_mex": in_mex,
            })

    for ref in sorted(paired_in_mex):
        if not (project / ref).is_file():
            missing_refs_in_mex.append(ref)

    return {
        "project": str(project),
        "pairings_file": str(pairings_file),
        "pairings_file_exists": pairings_file.is_file(),
        "docs": docs,
        "unpaired_with_symbols": unpaired_with_symbols,
        "missing_refs_in_mex": missing_refs_in_mex,
        "ok": not unpaired_with_symbols and not missing_refs_in_mex,
    }


def resolve_mex_bin() -> str | None:
    for candidate in (
        os.environ.get("MEX_AGENT_BIN"),
        shutil.which("mex-agent"),
        str(Path.home() / ".local/bin/mex-agent"),
    ):
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def sync_pairings(project: Path, dry_run: bool = False) -> dict:
    audit = audit_pairings(project)
    unpaired = {d["path"]: d for d in audit["docs"] if d["path"] in audit["unpaired_with_symbols"]}
    if not unpaired:
        return {"action": "sync", "dry_run": dry_run, "operations": [], "applied": False, "audit": audit, "ok": audit["ok"]}

    mex_bin = resolve_mex_bin()
    if not mex_bin:
        return {
            "action": "sync",
            "dry_run": dry_run,
            "operations": [],
            "applied": False,
            "error": "mex-agent executable not found",
            "audit": audit,
            "ok": False,
        }

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    ops = []
    for rel, doc in unpaired.items():
        grounds_to = [g for s in doc["paired_symbols"] if (g := parse_symbol_ref(s)) is not None]
        if not grounds_to:
            continue
        digest = hashlib.sha256(f"{rel}:{'|'.join(doc['paired_symbols'])}".encode("utf-8")).hexdigest()[:12]
        ops.append({
            "opId": f"pair_sync_{digest}",
            "type": "create-entry",
            "actor": {"kind": "agent", "id": "repo-knowledge-wiki"},
            "timestamp": now,
            "reason": f"Pair {rel} with code symbols via pair_sync.py",
            "payload": {
                "file": "context/knowledge-pairings.md",
                "description": "Bridge entities pairing root knowledge/ documents (queries, work checks, concepts) with grounded code symbols.",
                "insertAt": {"at": "end-of-file"},
                "type": "fact",
                "title": f"Knowledge Pairing: {doc['title']}",
                "body": f"- **Doc**: `{rel}`\n- **Kind**: `{doc['kind']}` (`status: {doc['status']}`)\n- **Paired**: {', '.join(format_symbol_for_markdown(s) for s in doc['paired_symbols'])}",
                "headingDepth": 2,
                "status": "promoted",
                "groundsTo": grounds_to,
            },
        })

    if not ops:
        return {"action": "sync", "dry_run": dry_run, "operations": [], "applied": False, "audit": audit, "ok": audit["ok"]}

    op_dir = project / ".mex/local/setup-ops"
    op_dir.mkdir(parents=True, exist_ok=True)
    op_file = op_dir / "pair-sync.json"
    op_file.write_text(json.dumps(ops, indent=2) + "\n", encoding="utf-8")

    cmd = [mex_bin, "wiki", "apply", str(op_file), "--dry-run" if dry_run else "--apply", "--json"]
    proc = subprocess.run(cmd, cwd=project, capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        return {
            "action": "sync",
            "dry_run": dry_run,
            "operations": [o["opId"] for o in ops],
            "applied": False,
            "exit_code": proc.returncode,
            "stderr": (proc.stdout + proc.stderr).strip(),
            "audit": audit,
            "ok": False,
        }

    if not dry_run:
        subprocess.run([mex_bin, "graph", "refresh"], cwd=project, capture_output=True, text=True, timeout=120)
        zg = shutil.which("zg")
        if zg and (project / ".zvec-grep").is_dir():
            subprocess.run([zg, "index"], cwd=project, capture_output=True, text=True, timeout=300)

    post_audit = audit_pairings(project) if not dry_run else audit
    return {
        "action": "sync",
        "dry_run": dry_run,
        "operations": [o["opId"] for o in ops],
        "applied": not dry_run,
        "op_file": str(op_file),
        "audit": post_audit,
        "ok": True if dry_run else post_audit["ok"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default=os.getcwd(), help="Target repository root")
    parser.add_argument("--sync", action="store_true", help="Sync unpaired docs into .mex/context/knowledge-pairings.md")
    parser.add_argument("--dry-run", action="store_true", help="Preview --sync without writing")
    parser.add_argument("--json", action="store_true", help="Emit JSON output")
    args = parser.parse_args()

    project = Path(args.project).expanduser().resolve()
    res = sync_pairings(project, dry_run=args.dry_run) if args.sync else audit_pairings(project)
    if args.json:
        print(json.dumps(res, indent=2))
    elif args.sync:
        print(f"repo-knowledge-wiki sync ({'dry-run' if args.dry_run else 'applied'}): "
              f"{len(res.get('operations', []))} op(s), ok={res['ok']}")
    else:
        print(f"Docs audited: {len(res['docs'])}, unpaired: {len(res['unpaired_with_symbols'])}, "
              f"dangling mex refs: {len(res['missing_refs_in_mex'])}")
        for p in res["unpaired_with_symbols"]:
            print(f"  UNPAIRED: {p}")
        for p in res["missing_refs_in_mex"]:
            print(f"  MISSING:  {p}")
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
