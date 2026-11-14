#!/usr/bin/env python3
"""Local offline search and retrieval engine for modern-web-guidance."""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_ROOT = SCRIPT_DIR.parent
GUIDES_DIR = SKILL_ROOT / "guides"

def find_all_guides() -> list[dict]:
    guides = []
    if not GUIDES_DIR.is_dir():
        return guides
    for root, _, files in os.walk(GUIDES_DIR):
        for f in files:
            if not f.endswith(".md"):
                continue
            full_path = Path(root) / f
            rel = full_path.relative_to(GUIDES_DIR)
            guide_id = str(rel).replace(".md", "")
            
            # Read first header or lines for description
            title = guide_id
            description = ""
            try:
                content = full_path.read_text(encoding="utf-8")
                lines = content.splitlines()
                for line in lines:
                    line = line.strip()
                    if line.startswith("# ") and not title:
                        title = line[2:].strip()
                    elif line and not line.startswith("#") and not description:
                        description = line[:200]
                if not description:
                    description = f"Modern web guidance for {guide_id}."
            except Exception:
                description = f"Guide for {guide_id}."
                
            guides.append({
                "id": guide_id,
                "title": title,
                "description": description,
                "path": str(full_path)
            })
    return guides

def cmd_search(query: str, as_json: bool) -> int:
    terms = [t.lower() for t in query.split() if t.strip()]
    if not terms:
        print("[]" if as_json else "No query specified.")
        return 0
    
    guides = find_all_guides()
    scored = []
    for g in guides:
        score = 0
        text = f"{g['id']} {g['title']} {g['description']}".lower()
        matched = 0
        for term in terms:
            if term in g['id'].lower():
                score += 10
                matched += 1
            elif term in g['title'].lower():
                score += 5
                matched += 1
            elif term in text:
                score += 2
                matched += 1
        if matched > 0:
            scored.append((score, g))
            
    scored.sort(key=lambda x: x[0], reverse=True)
    results = [{"id": g["id"], "description": g["description"]} for _, g in scored[:15]]
    
    if as_json:
        print(json.dumps(results, indent=2, ensure_ascii=False))
    else:
        print(f"Found {len(results)} matching guides:")
        for r in results:
            print(f"- {r['id']}: {r['description']}")
    return 0

def cmd_retrieve(ids: str) -> int:
    guide_ids = [i.strip() for i in ids.split(",") if i.strip()]
    for gid in guide_ids:
        target = GUIDES_DIR / f"{gid}.md"
        if not target.is_file():
            # Try fuzzy match
            candidates = list(GUIDES_DIR.glob(f"**/{gid}.md"))
            if candidates:
                target = candidates[0]
        if target.is_file():
            print(f"\n--- [Guide: {gid}] ---")
            print(target.read_text(encoding="utf-8"))
        else:
            print(f"Error: Guide '{gid}' not found in {GUIDES_DIR}", file=sys.stderr)
    return 0

def main() -> int:
    parser = argparse.ArgumentParser(description="Modern Web Guidance Local Engine")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    p_search = subparsers.add_parser("search", help="Search guides")
    p_search.add_argument("query", type=str, help="Search query")
    p_search.add_argument("--json", action="store_true", default=True, help="Output as JSON")
    
    p_retrieve = subparsers.add_parser("retrieve", help="Retrieve guide content")
    p_retrieve.add_argument("ids", type=str, help="Comma-separated guide IDs")
    
    p_list = subparsers.add_parser("list", help="List all available guides")
    p_list.add_argument("--json", action="store_true", default=False, help="Output as JSON")

    args = parser.parse_args()
    if args.command == "search":
        return cmd_search(args.query, args.json)
    elif args.command == "retrieve":
        return cmd_retrieve(args.ids)
    elif args.command == "list":
        guides = find_all_guides()
        if args.json:
            print(json.dumps([{"id": g["id"], "description": g["description"]} for g in guides], indent=2))
        else:
            for g in guides:
                print(f"- {g['id']}")
        return 0
    return 1

if __name__ == "__main__":
    sys.exit(main())
