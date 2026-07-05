#!/usr/bin/env python3
"""Generate the benchmark tables and the Contents list in README.md from
``data/benchmarks.yaml``.

Rows are listed **alphabetically** within each domain — a neutral order with no
ranking to argue about. The Stars column is a live shields.io badge, so it stays
current in the README without any crawling. This script does no network calls.

Usage:
    python scripts/generate_readme.py            # regenerate README from the data
    python scripts/generate_readme.py --check     # validate data only, non-zero on error
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "benchmarks.yaml"
README_FILE = ROOT / "README.md"

START_MARKER = "<!-- BENCHMARKS:START -->"
END_MARKER = "<!-- BENCHMARKS:END -->"
CONTENTS_START = "<!-- CONTENTS:START -->"
CONTENTS_END = "<!-- CONTENTS:END -->"

# Domain display order + metadata. Order here == order in the README.
DOMAINS: list[dict[str, str]] = [
    {
        "key": "General",
        "title": "General / Multi-domain Science",
        "blurb": "Cross-disciplinary STEM reasoning benchmarks; a few are broad exams where science is a major subset.",
    },
    {
        "key": "Math",
        "title": "Mathematics",
        "blurb": "Arithmetic, competition, olympiad, and frontier / formal-proof mathematics.",
    },
    {
        "key": "Physics",
        "title": "Physics & Astronomy",
        "blurb": "Physics olympiad, graduate physics, computational physics, and astronomy.",
    },
    {
        "key": "Chemistry",
        "title": "Chemistry",
        "blurb": "Molecular property, reaction, retrosynthesis, safety, and chemical knowledge.",
    },
    {
        "key": "Materials",
        "title": "Materials Science",
        "blurb": "Crystals, materials property prediction, and materials-science knowledge.",
    },
    {
        "key": "Biology",
        "title": "Biology & Life Sciences",
        "blurb": "Genomics, proteins, bioinformatics agents, protocols, and research biology.",
    },
    {
        "key": "Agentic",
        "title": "Agentic Science & AI Research",
        "blurb": "LLM agents that write research code, run data analyses, attempt autonomous discovery, and conduct ML/AI research.",
    },
]
DOMAIN_KEYS = {d["key"] for d in DOMAINS}

REQUIRED_FIELDS = [
    "name",
    "domain",
    "paper_title",
    "paper_url",
    "org",
    "year",
    "description",
]


# --------------------------------------------------------------------------- #
# Loading & validation
# --------------------------------------------------------------------------- #
def load_benchmarks() -> list[dict[str, Any]]:
    """Load the benchmark list from YAML."""
    with DATA_FILE.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or []
    if not isinstance(data, list):
        raise SystemExit("benchmarks.yaml must be a top-level list")
    return data


def validate(benchmarks: list[dict[str, Any]]) -> list[str]:
    """Return a list of human-readable data-integrity problems (empty == clean)."""
    problems: list[str] = []
    seen_names: set[str] = set()
    for i, b in enumerate(benchmarks):
        tag = b.get("name", f"index {i}")
        for field in REQUIRED_FIELDS:
            if not b.get(field) and b.get(field) != 0:
                problems.append(f"[{tag}] missing required field '{field}'")
        if b.get("domain") not in DOMAIN_KEYS:
            problems.append(
                f"[{tag}] invalid domain '{b.get('domain')}' "
                f"(allowed: {sorted(DOMAIN_KEYS)})"
            )
        name = b.get("name")
        if name in seen_names:
            problems.append(f"[{tag}] duplicate name")
        seen_names.add(name)
        gh = b.get("github")
        if gh and (gh.count("/") != 1 or gh.startswith("http")):
            problems.append(f"[{tag}] github must be 'owner/repo', got '{gh}'")
    return problems


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #
def escape(text: str) -> str:
    return str(text).replace("|", "\\|").replace("\n", " ").strip()


def anchor(title: str) -> str:
    """GitHub heading slug: lowercase, drop punctuation, spaces to hyphens."""
    slug = "".join(c for c in title.lower() if c.isalnum() or c in " -")
    return slug.replace(" ", "-")


def star_cell(b: dict[str, Any]) -> str:
    gh = b.get("github")
    if not gh:
        return "—"
    # Live shields badge — always current, no crawling required.
    badge = (
        f"https://img.shields.io/github/stars/{gh}"
        f"?style=flat&logo=github&logoColor=white&label=&color=181717"
    )
    return f"[![stars]({badge})](https://github.com/{gh})"


def render_table(rows: list[dict[str, Any]]) -> str:
    header = (
        "| Benchmark | Org | Year | Paper | Code | Stars | Description |\n"
        "|---|---|:--:|:--:|:--:|:--:|---|"
    )
    lines = [header]
    for b in rows:
        paper = f"[paper]({b['paper_url']})" if b.get("paper_url") else "—"
        code = f"[code](https://github.com/{b['github']})" if b.get("github") else "—"
        cells = [
            f"**{escape(b['name'])}**",
            escape(b.get("org", "")),
            str(b.get("year", "")),
            paper,
            code,
            star_cell(b),
            escape(b["description"]),
        ]
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def render_contents(benchmarks: list[dict[str, Any]]) -> str:
    """A plain bulleted list of domain links, in fixed order."""
    return "\n".join(
        f"- [{dom['title']}](#{anchor(dom['title'])})"
        for dom in DOMAINS
        if any(b["domain"] == dom["key"] for b in benchmarks)
    )


def render_sections(benchmarks: list[dict[str, Any]]) -> str:
    """Render one `### domain` section with an alphabetically-sorted table."""
    parts: list[str] = []
    for dom in DOMAINS:
        rows = [b for b in benchmarks if b["domain"] == dom["key"]]
        if not rows:
            continue
        rows.sort(key=lambda b: b["name"].lower())
        parts.append(f"### {dom['title']}\n")
        parts.append(f"> {dom['blurb']}\n")
        parts.append(render_table(rows))
        parts.append("\n[Back to top](#contents)\n")
    return "\n".join(parts)


def splice(text: str, start: str, end: str, payload: str) -> str:
    """Replace the region between two markers, keeping the markers in place."""
    if start not in text or end not in text:
        raise SystemExit(f"markers {start}/{end} not found in README.md")
    pre = text.split(start)[0]
    post = text.split(end)[1]
    return f"{pre}{start}\n{payload}\n{end}{post}"


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate data only; exit non-zero on any problem",
    )
    args = parser.parse_args()

    benchmarks = load_benchmarks()
    problems = validate(benchmarks)
    if problems:
        print("Data integrity problems:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    if args.check:
        print(f"OK: {len(benchmarks)} benchmarks validated, no problems.")
        return 0

    readme = README_FILE.read_text(encoding="utf-8")
    readme = splice(readme, CONTENTS_START, CONTENTS_END, render_contents(benchmarks))
    readme = splice(readme, START_MARKER, END_MARKER, render_sections(benchmarks))
    README_FILE.write_text(readme, encoding="utf-8")

    print(f"README.md regenerated ({len(benchmarks)} benchmarks, alphabetical).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
