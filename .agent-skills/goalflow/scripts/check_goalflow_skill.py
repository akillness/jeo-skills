#!/usr/bin/env python3
"""Static check for a goalflow RUNTIME skill (skills/<id>/SKILL.md).

Stdlib-only -- includes a minimal frontmatter parser so PyYAML is not needed.

These are goalflow runtime skills consumed by src/goalflow/skill/ (prompt
injection) or src/agent_kit/skills/ (also executable). They are NOT jeo-skills
catalog skills -- for those, use skill-standardization.

What it checks (per docs/skills.md):
  - required frontmatter: name, description
  - optional: version, author, tags, triggers, enabled
  - description quality -- the LLM matcher reasons over this field alone
  - body size -- bodies are injected VERBATIM into the system prompt, so
    length is a per-matched-turn cost
  - enabled: false (skill is parsed but skipped)
  - scripts/ presence, and which engine would execute it

Usage:
  check_goalflow_skill.py skills/weather_query
  check_goalflow_skill.py skills/weather_query/SKILL.md
  check_goalflow_skill.py --all skills/

Output: one ```review fenced JSON block.
Exit code: 1 if any blocker is present, 2 on usage/IO error, else 0.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

REQUIRED = ("name", "description")
KNOWN = ("name", "description", "version", "author", "tags", "triggers", "enabled")

# Body is injected verbatim into the system prompt on every matched turn.
BODY_WARN_CHARS = 4000
BODY_BLOCK_CHARS = 12000
DESC_MIN_CHARS = 20
DESC_MIN_CJK_CHARS = 10  # CJK is denser; the same threshold would nag on valid Chinese skills


def parse_frontmatter(text: str) -> tuple[dict, str, str | None]:
    """Return (fields, body, error).

    Minimal YAML: scalars, inline lists (`[a, b]`), and block lists
    (`key:` followed by indented `- item` lines). Block style is what the
    upstream example skill actually uses.
    """
    if not text.startswith("---"):
        return {}, text, "file does not start with a '---' frontmatter block"
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}, text, "frontmatter block is not closed with '---'"
    raw, body = parts[1], parts[2]

    fields: dict = {}
    pending_key: str | None = None
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue

        # Continuation of a block list started on a previous line.
        item = re.match(r"^\s+-\s+(.*)$", line)
        if item and pending_key:
            fields.setdefault(pending_key, []).append(item.group(1).strip().strip("'\""))
            continue

        m = re.match(r"^([A-Za-z_][\w-]*)\s*:\s*(.*)$", line)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        pending_key = None

        if not val:
            # `key:` with nothing after it — a block list may follow.
            pending_key = key
            fields[key] = []
        elif val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            fields[key] = [v.strip().strip("'\"") for v in inner.split(",") if v.strip()]
        elif val.lower() in ("true", "false"):
            fields[key] = val.lower() == "true"
        else:
            fields[key] = val.strip("'\"")
    return fields, body, None


def is_cjk_heavy(text: str) -> bool:
    """CJK carries far more meaning per character than Latin script."""
    if not text:
        return False
    cjk = sum(1 for c in text if "一" <= c <= "鿿" or "぀" <= c <= "ヿ")
    return cjk * 2 >= len(text)


def resolve(target: str) -> tuple[str, str]:
    """Return (skill_md_path, skill_dir)."""
    if os.path.isdir(target):
        return os.path.join(target, "SKILL.md"), target
    return target, os.path.dirname(target) or "."


def check_one(target: str) -> list[dict]:
    md_path, skill_dir = resolve(target)
    # skill_id is derived from the DIRECTORY name, never from the file.
    skill_id = os.path.basename(os.path.abspath(skill_dir))
    findings: list[dict] = []

    def add(severity, check_id, message, remediation):
        findings.append({
            "id": check_id,
            "severity": severity,
            "skill_id": skill_id,
            "file": md_path,
            "message": message,
            "remediation": remediation,
        })

    if not os.path.isfile(md_path):
        add("blocker", "missing_skill_md",
            f"No SKILL.md at {md_path}.",
            "Every skill directory needs a SKILL.md; SkillRegistry skips directories without one.")
        return findings

    try:
        with open(md_path, encoding="utf-8", errors="replace") as fh:
            text = fh.read()
    except OSError as exc:
        add("blocker", "unreadable", f"Cannot read {md_path}: {exc}", "Fix permissions or encoding.")
        return findings

    fields, body, err = parse_frontmatter(text)
    if err:
        add("blocker", "frontmatter", f"Frontmatter unparseable: {err}.",
            "SKILL.md must be YAML frontmatter delimited by '---' followed by a Markdown body.")
        return findings

    for key in REQUIRED:
        if not str(fields.get(key, "")).strip():
            add("blocker", f"missing_{key}",
                f"Required frontmatter field '{key}' is missing or empty.",
                "SkillRegistry validates required fields and rejects the skill without them.")

    desc = str(fields.get("description", "")).strip()
    desc_min = DESC_MIN_CJK_CHARS if is_cjk_heavy(desc) else DESC_MIN_CHARS
    if desc and len(desc) < desc_min:
        add("warning", "description_thin",
            f"description is only {len(desc)} chars (threshold {desc_min} for this script).",
            "The LLM matcher reasons over description alone. Say specifically WHEN the skill "
            "applies, not just what it is -- a thin description either never matches or "
            "matches everything.")
    if desc and not re.search(r"when|if|用于|查询|需要|适用", desc, re.I):
        add("info", "description_no_trigger",
            "description does not describe a triggering condition.",
            "Phrase it around when to activate, e.g. 'Use when the user asks about ...'.")

    if fields.get("enabled") is False:
        add("info", "disabled",
            "enabled: false -- this skill is parsed but skipped at match time.",
            "Intentional for staging a skill; remove or set true to activate it.")

    body_len = len(body.strip())
    if body_len == 0:
        add("blocker", "empty_body",
            "Body is empty; there is nothing to inject.",
            "Add usage rules, examples, and limits -- the body IS the injected instruction.")
    elif body_len > BODY_BLOCK_CHARS:
        add("blocker", "body_oversized",
            f"Body is {body_len} chars and is injected verbatim on every matched turn.",
            f"Cut below ~{BODY_WARN_CHARS} chars. Keep usage rules, examples, and limits; "
            "drop prose the model does not need.")
    elif body_len > BODY_WARN_CHARS:
        add("warning", "body_large",
            f"Body is {body_len} chars; that is prompt cost on every matched turn.",
            f"Aim under ~{BODY_WARN_CHARS} chars unless the detail is load-bearing.")

    unknown = [k for k in fields if k not in KNOWN]
    if unknown:
        add("info", "unknown_fields",
            "Unrecognized frontmatter field(s): " + ", ".join(sorted(unknown)) + ".",
            "SkillMetadata reads name/description/version/author/tags/triggers/enabled; "
            "others are ignored.")

    if "skill_id" in fields:
        add("warning", "skill_id_in_frontmatter",
            "skill_id is set in frontmatter but is ignored.",
            f"skill_id is derived from the directory name (here: '{skill_id}'). "
            "Rename the directory to change it.")

    scripts_dir = os.path.join(skill_dir, "scripts")
    if os.path.isdir(scripts_dir):
        add("info", "scripts_present",
            "A scripts/ directory exists.",
            "The main-project engine (src/goalflow/skill/) records scripts_dir but does NOT "
            "execute it. Only the agent_kit engine runs executable ('module:func') skills.")

    if not fields.get("version"):
        add("info", "no_version",
            "No version set; defaults to 1.0.0.",
            "The injected heading renders as '### {name} (v{version})'.")

    return findings


def main() -> int:
    ap = argparse.ArgumentParser(description="Static check for goalflow runtime SKILL.md files.")
    ap.add_argument("--all", action="store_true",
                    help="treat each target as a directory of skill directories")
    ap.add_argument("targets", nargs="+", help="skill dir, SKILL.md path, or skills/ root with --all")
    args = ap.parse_args()

    targets: list[str] = []
    if args.all:
        for root in args.targets:
            if not os.path.isdir(root):
                print(f"error: not a directory: {root}", file=sys.stderr)
                return 2
            targets.extend(
                os.path.join(root, n) for n in sorted(os.listdir(root))
                if os.path.isdir(os.path.join(root, n))
            )
        if not targets:
            print(f"error: no skill directories under {args.targets}", file=sys.stderr)
            return 2
    else:
        targets = args.targets

    findings: list[dict] = []
    for t in targets:
        findings.extend(check_one(t))

    counts = {lvl: 0 for lvl in ("blocker", "warning", "info")}
    for f in findings:
        counts[f["severity"]] += 1

    report = {
        "tool": "goalflow/check_goalflow_skill",
        "check": "goalflow runtime SKILL.md contract",
        "skills_checked": len(targets),
        "counts": counts,
        "verdict": "blocked" if counts["blocker"] else ("review" if counts["warning"] else "clean"),
        "findings": findings,
        "limits": [
            "Static frontmatter and size analysis only.",
            "Cannot predict whether the LLM matcher will actually select this skill.",
            "Does not resolve or import executable 'module:func' skill references.",
        ],
    }

    print("```review")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print("```")
    return 1 if counts["blocker"] else 0


if __name__ == "__main__":
    sys.exit(main())
