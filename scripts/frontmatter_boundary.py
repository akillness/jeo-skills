#!/usr/bin/env python3
"""Single source of truth for SKILL.md frontmatter boundaries (A0-b).

Rule 7 (B-1), rule 14 (B-1') and rule 15 (B-1'') MUST all reuse the helpers in
this module. Re-implementing boundary detection anywhere else re-opens the
rule-7 x rule-F deadlock this module exists to prevent: rule 7/14/15 read only
the body, rule F reads only the frontmatter block, so the two never meet on the
same byte.

Also produces the A0-a/A0-b artifacts:

  .frontmatter/baseline.txt   <slug>\\t<sha256(frontmatter block)>   (rule F baseline)
  .frontmatter/fm-census.tsv  <slug>\\t<fm>\\t<body>\\t<total>\\t<desc_len>

`SKILL.md.baseline` files and nested SKILL.md copies are excluded from
discovery; only `<root>/<slug>/SKILL.md` counts.
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path
from typing import Iterator

DEFAULT_ROOT = Path(".agent-skills")
ARTIFACT_DIR = Path(".frontmatter")
BASELINE_NAME = "baseline.txt"
CENSUS_NAME = "fm-census.tsv"

_FENCE = "---"


class BoundaryError(RuntimeError):
    """Raised when a document has no parseable frontmatter boundary."""


def iter_skill_docs(root: Path | str = DEFAULT_ROOT) -> Iterator[Path]:
    """Yield `<root>/<slug>/SKILL.md`, sorted by slug.

    Excludes `SKILL.md.baseline` (a different filename, so `glob` already skips
    it) and any nested `*/*/SKILL.md`, which belong to vendored mirrors or
    autoresearch snapshots rather than the catalog itself.
    """
    root = Path(root)
    for child in sorted(root.iterdir(), key=lambda p: p.name):
        if not child.is_dir():
            continue
        doc = child / "SKILL.md"
        if doc.is_file():
            yield doc


def slug_of(path: Path) -> str:
    return path.parent.name


def _split(text: str, path: Path) -> tuple[str, str]:
    """Return (frontmatter_block_including_fences, body)."""
    if not text.startswith(_FENCE):
        raise BoundaryError(f"{path}: no opening '---' fence")
    # Find the closing fence: a line that is exactly '---' after the opener.
    match = re.search(r"^---[ \t]*$", text[3:], re.M)
    if match is None:
        raise BoundaryError(f"{path}: frontmatter fence is not terminated")
    end = 3 + match.end()
    return text[:end], text[end:]


def frontmatter_block(path: Path | str) -> str:
    """Verbatim frontmatter block, both `---` fences included.

    This is the ONLY definition of the frontmatter boundary. Rule F hashes
    exactly these bytes.
    """
    path = Path(path)
    return _split(path.read_text(encoding="utf-8"), path)[0]


def body_after_frontmatter(path: Path | str) -> str:
    """Everything after the closing fence — the region rules 7/14/15 may read."""
    path = Path(path)
    return _split(path.read_text(encoding="utf-8"), path)[1]


def frontmatter_sha256(path: Path | str) -> str:
    return hashlib.sha256(frontmatter_block(path).encode("utf-8")).hexdigest()


def description_length(path: Path | str) -> int:
    """Whitespace-normalized character length of the parsed `description`.

    Returns 0 when the frontmatter does not parse or carries no description;
    callers that need strictness must check separately.
    """
    try:
        import yaml
    except ImportError:  # pragma: no cover - PyYAML is a hard dep of the repo tooling
        raise BoundaryError("PyYAML is required: pip install pyyaml")
    block = frontmatter_block(path)
    inner = block[3:].rsplit(_FENCE, 1)[0]
    try:
        data = yaml.safe_load(inner)
    except yaml.YAMLError:
        return 0
    if not isinstance(data, dict):
        return 0
    return len(" ".join(str(data.get("description", "")).split()))


def build_baseline(root: Path | str = DEFAULT_ROOT) -> list[tuple[str, str]]:
    return [(slug_of(doc), frontmatter_sha256(doc)) for doc in iter_skill_docs(root)]


def build_census(root: Path | str = DEFAULT_ROOT) -> list[tuple[str, int, int, int, int]]:
    rows = []
    for doc in iter_skill_docs(root):
        raw = doc.read_text(encoding="utf-8")
        front, body = _split(raw, doc)
        rows.append(
            (
                slug_of(doc),
                len(front.encode("utf-8")),
                len(body.encode("utf-8")),
                len(raw.encode("utf-8")),
                description_length(doc),
            )
        )
    return rows


def write_artifacts(root: Path | str = DEFAULT_ROOT, out_dir: Path | str = ARTIFACT_DIR) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    baseline = build_baseline(root)
    slugs = [slug for slug, _ in baseline]
    duplicates = {s for s in slugs if slugs.count(s) > 1}
    if duplicates:
        raise BoundaryError(f"duplicate slugs in baseline: {sorted(duplicates)}")
    (out_dir / BASELINE_NAME).write_text(
        "".join(f"{slug}\t{digest}\n" for slug, digest in baseline), encoding="utf-8"
    )

    census = build_census(root)
    (out_dir / CENSUS_NAME).write_text(
        "slug\tfm_bytes\tbody_bytes\ttotal_bytes\tdesc_len\n"
        + "".join(f"{s}\t{f}\t{b}\t{t}\t{d}\n" for s, f, b, t, d in census),
        encoding="utf-8",
    )

    fm_sizes = sorted(row[1] for row in census)
    # A frontmatter larger than (4096 - 2750) cannot satisfy body<=2750 AND
    # total<=4096 simultaneously; those skills need the exempt-FM ledger.
    exempt_threshold = 4096 - 2750
    return {
        "count": len(baseline),
        "fm_median": fm_sizes[len(fm_sizes) // 2],
        "fm_max": fm_sizes[-1],
        "fm_over_threshold": [(s, f) for s, f, _b, _t, _d in census if f > exempt_threshold],
        "body_over_2750": [(s, b) for s, _f, b, _t, _d in census if b > 2750],
        "exempt_threshold": exempt_threshold,
    }


def self_test(root: Path | str = DEFAULT_ROOT, sample: int = 3) -> int:
    import yaml

    docs = list(iter_skill_docs(root))
    if not docs:
        print("self-test FAILED: no SKILL.md documents discovered", file=sys.stderr)
        return 1
    checked = 0
    for doc in docs[:sample] + docs[-sample:]:
        block = frontmatter_block(doc)
        if not block.startswith(_FENCE) or not block.rstrip().endswith(_FENCE):
            print(f"self-test FAILED: {doc} block is not fence-delimited", file=sys.stderr)
            return 1
        inner = block[3:].rsplit(_FENCE, 1)[0]
        if not isinstance(yaml.safe_load(inner), dict):
            print(f"self-test FAILED: {doc} frontmatter is not a mapping", file=sys.stderr)
            return 1
        if body_after_frontmatter(doc).startswith(_FENCE):
            print(f"self-test FAILED: {doc} body still begins with a fence", file=sys.stderr)
            return 1
        checked += 1
    print(f"self-test ok: {checked} documents, {len(docs)} discovered")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", default=str(DEFAULT_ROOT), type=Path)
    parser.add_argument("--out-dir", default=str(ARTIFACT_DIR), type=Path)
    parser.add_argument("--write", action="store_true", help="write baseline.txt and fm-census.tsv")
    parser.add_argument("--self-test", action="store_true", help="verify the boundary function")
    args = parser.parse_args()

    if args.self_test:
        return self_test(args.root)

    if args.write:
        stats = write_artifacts(args.root, args.out_dir)
        print(f"skills: {stats['count']}")
        print(f"frontmatter bytes: median {stats['fm_median']:,}  max {stats['fm_max']:,}")
        print(
            f"frontmatter > {stats['exempt_threshold']:,}B (cannot meet body<=2750 AND total<=4096): "
            f"{len(stats['fm_over_threshold'])}"
        )
        for slug, size in stats["fm_over_threshold"]:
            print(f"  {slug:<40}{size:>7,}B")
        print(f"body > 2,750B: {len(stats['body_over_2750'])}")
        return 0

    parser.error("pass --write or --self-test")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
