#!/usr/bin/env python3
"""Build the A0-c' frontmatter exception ledger (5 records).

The ledger is a RESULT byte pin, not a permission slip: it records both
`before_sha256` (must equal the A0-c baseline) and `after_sha256` (the exact
bytes L1x must produce). A listed skill that lands on any other hash fails rule
F just as loudly as an unlisted skill that changed.

This script only COMPUTES and VERIFIES the pins — it never writes SKILL.md.
G001 does not touch product content; L1x (G002) applies the edits.

Each candidate is checked for: YAML validity, description <= 1024 chars, and the
D-1 trigger-keyword subset rule (anything lost must be in `approved_removals`).
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import yaml  # noqa: E402

from frontmatter_boundary import frontmatter_block  # noqa: E402
from routing_harness import trigger_keywords  # noqa: E402

SKILLS = Path(".agent-skills")
ART = Path(".frontmatter")
APPROVAL = "USER-INTENT-GATE-2026-07-28"

# --- restored descriptions (authored from each skill's own body) -------------
# 056e3f8 generated these three from skills.toon, whose text was already
# truncated; there is no pre-truncation original in git history to restore
# (before 056e3f8 the field was the placeholder `">"`). They are therefore
# re-authored from the skill's "When to use this skill" section.

API_DESIGN_DESC = """\
  Design or refactor API contracts for REST and GraphQL systems. Use when the user
  needs resource boundaries, naming, status codes, pagination, filtering,
  idempotency, or error models decided before implementation starts; when an
  OpenAPI or GraphQL SDL contract must exist first; when versioning and
  backward-compatibility tradeoffs need a decision; or when an implementation-ready
  contract packet must be handed to backend, frontend, QA, or partner teams.
  Triggers on: API design, REST contract, GraphQL schema, OpenAPI, SDL, resource
  modeling, endpoint naming, status codes, pagination, filtering, idempotency,
  error model, API versioning, backward compatibility, breaking change.
"""

API_DOCUMENTATION_DESC = """\
  Publish or refresh developer-facing API documentation for REST, GraphQL, webhook,
  SDK, and portal surfaces. Use when reference pages, quickstarts, or portal
  structure must be usable by external developers, partners, or internal
  integrators; when an OpenAPI or schema artifact already exists but the docs need
  examples, auth/setup guidance, error handling, or clearer navigation; when docs
  drifted after auth, versioning, retry, pagination, webhook, or SDK changes; or
  when a large API surface needs grouping and selective publishing instead of one
  giant reference dump. Triggers on: API docs, developer portal, quickstart,
  OpenAPI reference, SDK guide, webhook docs, integration guide, docs drift,
  migration notes.
"""

DATA_ANALYSIS_DESC = """\
  Analyze datasets to extract insights, identify patterns, and generate reports. Use
  when exploring a dataset, export, report extract, query result, or shaped event or
  telemetry table for evidence-backed conclusions; when the task is to understand
  what changed, compare segments, summarize performance, or explain anomalies in
  business terms; or when data-quality checks must precede conclusions. Route
  repeated anomaly or code-pattern scanning to pattern-detection, BI dashboard work
  to looker-studio-bigquery, repository navigation to codebase-search, and log or
  incident triage to log-analysis. Triggers on: CSV, JSON, SQL tables, retention,
  cohorts, funnels, conversion, spend, telemetry, event exports, KPIs, data quality,
  analysis narrative.
"""


def _replace_description(block: str, new_body: str) -> str:
    """Swap the folded `description:` scalar, leaving every other key untouched."""
    lines = block.split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith("description:"))
    end = start + 1
    while end < len(lines) and (lines[end].startswith("  ") or not lines[end].strip()):
        if lines[end].strip() and not lines[end].startswith("  "):
            break
        end += 1
    return "\n".join(lines[: start + 1] + new_body.rstrip("\n").split("\n") + lines[end:])


def _sub(block: str, old: str, new: str) -> str:
    assert old in block, f"anchor not found: {old!r}"
    assert block.count(old) == 1, f"anchor is ambiguous ({block.count(old)}x): {old!r}"
    return block.replace(old, new)


def candidates() -> list[dict]:
    ss = frontmatter_block(SKILLS / "skill-standardization/SKILL.md")
    unity = frontmatter_block(SKILLS / "unity-gamedev-skill-pack/SKILL.md")

    ss_after = _sub(
        ss,
        "  `SKILL.toon`, `SKILL.compact.md`) still match the live skill folders. In",
        "  `SKILL.compact.md`) still match the live skill folders. In",
    )
    ss_after = _sub(
        ss_after,
        '  "catalog sync", "SKILL.toon drift", "compact skill drift", "canonical skill".',
        '  "catalog sync", "compact skill drift", "canonical skill".',
    )
    unity_after = _sub(
        unity,
        "  docs, toon rules, and eval suites.",
        "  docs and eval suites.",
    )

    return [
        {
            "slug": "skill-standardization", "key": "description", "lines": "9, 13",
            "reason": "SKILL.toon maintenance instructions live in the description; H1 deletes that asset, so keeping them would leave a false trigger",
            "after": ss_after,
            "approved_removals": "skill.toon, SKILL.toon drift",
            "projection_targets": "skills.json, skills.toon",
        },
        {
            "slug": "api-design", "key": "description", "lines": "4",
            "reason": "056e3f8 recorded a truncated TOON description; trigger content was actually lost at 'needs resou...'",
            "after": _replace_description(frontmatter_block(SKILLS / "api-design/SKILL.md"), API_DESIGN_DESC),
            "approved_removals": "resou",
            "projection_targets": "skills.json, skills.toon",
        },
        {
            "slug": "api-documentation", "key": "description", "lines": "4-5",
            "reason": "056e3f8 recorded a truncated TOON description",
            "after": _replace_description(frontmatter_block(SKILLS / "api-documentation/SKILL.md"), API_DOCUMENTATION_DESC),
            "approved_removals": "",
            "projection_targets": "skills.json, skills.toon",
        },
        {
            "slug": "data-analysis", "key": "description", "lines": "4-5",
            "reason": "056e3f8 recorded a truncated TOON description",
            "after": _replace_description(frontmatter_block(SKILLS / "data-analysis/SKILL.md"), DATA_ANALYSIS_DESC),
            "approved_removals": "",
            "projection_targets": "skills.json, skills.toon",
        },
        {
            "slug": "unity-gamedev-skill-pack", "key": "compatibility", "lines": "12",
            "reason": "user-approved: remove every TOON trace from frontmatter so AC-18 can assert fm TOON = 0",
            "after": unity_after,
            "approved_removals": "toon rules",
            "projection_targets": "",
        },
    ]


def _desc(block: str) -> str:
    data = yaml.safe_load(block[3:].rsplit("---", 1)[0])
    return " ".join(str(data.get("description", "")).split())


def verify(rec: dict) -> list[str]:
    problems = []
    before_block = frontmatter_block(SKILLS / rec["slug"] / "SKILL.md")
    after_block = rec["after"]

    try:
        data = yaml.safe_load(after_block[3:].rsplit("---", 1)[0])
        if not isinstance(data, dict):
            problems.append("after frontmatter is not a YAML mapping")
    except yaml.YAMLError as exc:
        problems.append(f"after frontmatter does not parse: {exc}")
        return problems

    before_desc, after_desc = _desc(before_block), _desc(after_block)
    if len(after_desc) > 1024:
        problems.append(f"description is {len(after_desc)} chars (>1024)")

    if rec["key"] != "description" and before_desc != after_desc:
        problems.append("non-description record must leave the description untouched")

    approved = {t.strip().lower() for t in rec["approved_removals"].split(",") if t.strip()}
    lost = trigger_keywords(before_desc) - trigger_keywords(after_desc)
    unapproved = {l for l in lost if not any(a in l or l in a for a in approved)}
    if unapproved:
        problems.append(f"D-1 lost triggers without approval: {sorted(unapproved)[:6]}")

    rec["before_sha256"] = hashlib.sha256(before_block.encode()).hexdigest()
    rec["after_sha256"] = hashlib.sha256(after_block.encode()).hexdigest()
    rec["desc_len_before"] = len(before_desc)
    rec["desc_len_after"] = len(after_desc)
    if rec["before_sha256"] == rec["after_sha256"]:
        problems.append("after_sha256 equals before_sha256 — the edit is a no-op")
    return problems


def main() -> int:
    baseline = {}
    for line in (ART / "baseline.txt").read_text(encoding="utf-8").splitlines():
        if line.strip():
            slug, digest = line.split("\t")
            baseline[slug] = digest

    recs = candidates()
    failed = False
    for rec in recs:
        problems = verify(rec)
        if rec["before_sha256"] != baseline[rec["slug"]]:
            problems.append("before_sha256 does not match the A0-c baseline")
        status = "ok" if not problems else "FAIL"
        print(f"[{status}] #{recs.index(rec)+1} {rec['slug']} ({rec['key']}) "
              f"desc {rec['desc_len_before']} -> {rec['desc_len_after']} chars")
        for p in problems:
            print(f"        {p}")
            failed = True
    if failed:
        return 1

    out = [
        "# Frontmatter exception ledger (A0-c')",
        "#",
        "# A RESULT byte pin, not a permission slip. Rule F requires each listed",
        "# skill to land on exactly `after_sha256`; every other frontmatter block",
        "# must stay on its A0-c baseline hash. Records are separated by blank",
        "# lines and every field is required (a truncated record fails closed).",
        "#",
        "# While Rule F is active, the sha256 of THIS FILE is recorded outside it in",
        "# the ci.yml A0-c__recorded_hash constant and in the A0 gate report. Never",
        "# store an active pin here.",
        "#",
        f"# Cardinality: {len(recs)} exceptions + {len(baseline) - len(recs)} frozen = {len(baseline)}",
        "# Lifecycle: active until D4. At D4 remove the ci.yml pin and replace this",
        "# lifecycle note with the explicit archival marker checked by",
        "# validate-catalog-projections.py.",
        "",
    ]
    for rec in recs:
        out += [
            f"slug: {rec['slug']}",
            f"approval_ref: {APPROVAL}",
            f"reason: {rec['reason']}",
            f"key: {rec['key']}",
            f"lines: {rec['lines']}",
            f"before_sha256: {rec['before_sha256']}",
            f"after_sha256: {rec['after_sha256']}",
            f"desc_len_before: {rec['desc_len_before']}",
            f"desc_len_after: {rec['desc_len_after']}",
            f"approved_removals: {rec['approved_removals']}",
            f"projection_targets: {rec['projection_targets']}",
            "architect_signoff: pending",
            "",
        ]
    ledger = ART / "exception-ledger.txt"
    ledger.write_text("\n".join(out), encoding="utf-8")

    # The intended post-L1x frontmatter, so L1x applies bytes rather than prose.
    pending = ART / "pending-frontmatter"
    pending.mkdir(exist_ok=True)
    for rec in recs:
        (pending / f"{rec['slug']}.frontmatter").write_text(rec["after"], encoding="utf-8")

    print(f"\nwrote {ledger} ({len(recs)} records)")
    print(f"wrote {pending}/ ({len(recs)} intended frontmatter blocks)")
    print(f"ledger sha256: {hashlib.sha256(ledger.read_bytes()).hexdigest()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
