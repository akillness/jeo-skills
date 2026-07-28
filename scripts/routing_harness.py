#!/usr/bin/env python3
"""D-3 discovery-regression harness (deterministic, no LLM).

Rule F freezes 169 frontmatter blocks; the 5 ledger exceptions edit a
`description`, which is the byte an agent CLI matches on. D-3 proves those edits
do not move discovery:

  stage 1  trigger-keyword set difference before -> after must be empty
           (any loss needs an explicit `approved_removals` entry)
  stage 2  every query that routed to slug S under the OLD description must
           still route to S under the NEW one (100% required)

Routing is intentionally a deterministic lexical ranker, not a model. A harness
whose verdict changes between runs cannot prove a regression did not happen.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

MANIFEST = Path(".agent-skills/skills.json")

_STOP = {
    "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "at", "by",
    "with", "when", "use", "this", "skill", "that", "is", "are", "be", "it",
    "not", "from", "into", "as", "your", "you", "user", "users", "need", "needs",
    "route", "routes", "routing", "triggers",
}


def _normalize(token: str) -> str:
    """Strip quoting and trailing punctuation so `surfaces...` == `surfaces`.

    Lexical normalization, not a relaxation: a truncated description carries the
    ellipsis as part of its last token, so without this EVERY truncation repair
    would look like a lost trigger and D-1 would flag the fix instead of the
    defect. A genuinely dropped word still shows up as lost.
    """
    return token.strip("\"'`.,;:!?()[]{}").strip()


def tokens(text: str) -> list[str]:
    raw = re.findall(r"[a-z0-9][a-z0-9+.#'\"-]*", (text or "").lower())
    return [t for t in (_normalize(r) for r in raw) if t and t not in _STOP]


def trigger_keywords(description: str) -> set[str]:
    """Keywords an agent could match on.

    `Triggers on:` phrases are weighted as whole phrases; the rest of the
    description contributes bare tokens.
    """
    keys: set[str] = set()
    match = re.search(r"triggers on:(.*)$", description or "", re.I | re.S)
    if match:
        for phrase in re.split(r"[,;.]", match.group(1)):
            phrase = " ".join(phrase.split()).strip().lower().strip("\"'`.,;:")
            if phrase and len(phrase) > 2:
                keys.add(phrase)
    keys.update(tokens(description))
    return keys


def load_catalog(path: Path) -> dict[str, str]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return {s["name"]: s.get("description", "") for s in data["skills"]}


def build_query_set(slug: str, description: str, limit: int = 6) -> list[str]:
    """Deterministic queries derived from the description's trigger phrases."""
    match = re.search(r"triggers on:(.*)$", description or "", re.I | re.S)
    phrases = []
    if match:
        for phrase in re.split(r"[,;]", match.group(1)):
            phrase = " ".join(phrase.split()).strip(" .")
            if 3 < len(phrase) < 80:
                phrases.append(phrase)
    if not phrases:
        toks = tokens(description)
        phrases = [" ".join(toks[i : i + 4]) for i in range(0, min(len(toks), limit * 4), 4)]
    return sorted(set(phrases))[:limit]


def route(query: str, catalog: dict[str, str]) -> str | None:
    """Deterministic ranker: phrase hit dominates, token overlap breaks ties."""
    q = " ".join(query.split()).lower()
    q_tokens = set(tokens(query))
    best: tuple[float, str] | None = None
    for slug, desc in sorted(catalog.items()):
        d = " ".join((desc or "").split()).lower()
        score = 0.0
        if q and q in d:
            score += 100.0
        if q and q in slug.replace("-", " "):
            score += 50.0
        d_tokens = set(tokens(desc))
        if q_tokens:
            score += 10.0 * len(q_tokens & d_tokens) / len(q_tokens)
        score += 2.0 * len(q_tokens & set(tokens(slug.replace("-", " "))))
        if score > 0 and (best is None or score > best[0]):
            best = (score, slug)
    return best[1] if best else None


def d3_stage1(before: str, after: str) -> set[str]:
    return trigger_keywords(before) - trigger_keywords(after)


def d3_stage2(slug: str, before: str, after_catalog: dict[str, str], before_catalog: dict[str, str]) -> tuple[int, int, list[str]]:
    """Return (preserved, total, regressions) for queries that used to hit `slug`."""
    preserved = total = 0
    regressions = []
    for query in build_query_set(slug, before):
        if route(query, before_catalog) != slug:
            continue  # only queries that actually reached this skill matter
        total += 1
        if route(query, after_catalog) == slug:
            preserved += 1
        else:
            regressions.append(f"{query!r} -> {route(query, after_catalog)}")
    return preserved, total, regressions


def run(before_path: Path, after_path: Path, slugs: list[str]) -> int:
    before_catalog = load_catalog(before_path)
    after_catalog = load_catalog(after_path)
    targets = slugs or sorted(before_catalog)

    failed = False
    total_p = total_t = 0
    for slug in targets:
        before = before_catalog.get(slug, "")
        after = after_catalog.get(slug, "")
        lost = d3_stage1(before, after)
        preserved, total, regressions = d3_stage2(slug, before, after_catalog, before_catalog)
        total_p += preserved
        total_t += total
        status = "ok"
        if lost:
            status = f"STAGE1 lost={sorted(lost)[:5]}"
            failed = True
        if regressions:
            status = f"STAGE2 {status} regressions={regressions[:3]}"
            failed = True
        if lost or regressions or len(targets) <= 12:
            print(f"  {slug:<36} stage2 {preserved}/{total}  {status}")

    rate = 100.0 * total_p / total_t if total_t else 100.0
    print(f"D-3 stage2 routing preserved: {total_p}/{total_t} ({rate:.1f}%)  [100% required]")
    if total_t and total_p != total_t:
        failed = True
    return 1 if failed else 0


def self_test() -> int:
    """Self-comparison must be a perfect no-op, twice, to prove determinism."""
    catalog = load_catalog(MANIFEST)
    sample = sorted(catalog)[:12]
    first = {q: route(q, catalog) for slug in sample for q in build_query_set(slug, catalog[slug])}
    second = {q: route(q, catalog) for slug in sample for q in build_query_set(slug, catalog[slug])}
    if first != second:
        print("self-test FAILED: routing is not deterministic", file=sys.stderr)
        return 1
    print(f"determinism ok: {len(first)} queries stable across two runs")
    rc = run(MANIFEST, MANIFEST, sample)
    if rc != 0:
        print("self-test FAILED: identical catalogs must give stage1 empty and stage2 100%", file=sys.stderr)
    else:
        print("self-test ok: stage1 empty, stage2 100% on identical catalogs")
    return rc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--baseline-catalog", type=Path, default=MANIFEST)
    parser.add_argument("--candidate-catalog", type=Path, default=MANIFEST)
    parser.add_argument("--slugs", default="", help="comma-separated slugs (default: all)")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        return self_test()
    slugs = [s.strip() for s in args.slugs.split(",") if s.strip()]
    return run(args.baseline_catalog, args.candidate_catalog, slugs)


if __name__ == "__main__":
    raise SystemExit(main())
