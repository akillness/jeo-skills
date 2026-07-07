# Research Harvesting (ai4s-research/open-science pattern)

Use this note when Scrapling is being pointed at scientific literature, datasets,
or citation metadata instead of general web content. Research harvesting needs
one extra gate that ordinary scraping does not: a documented, offline,
deterministic check that runs **before** any request leaves the machine.

This pattern is modeled on the skill standard used by
[ai4s-research/open-science](https://github.com/ai4s-research/open-science), an
open, local-first AI research workbench. Its skills
(`runtime/skills/core/domain-check`, `runtime/skills/core/literature-review`,
`runtime/skills/core/citation-reviewer`, `runtime/skills/core/traceability-review`)
share one contract worth reusing here:

- A `SKILL.md` with only `name` + `description` frontmatter, triggered by intent
  rather than by a mode flag.
- A single stdlib-only Python script shipped beside the `SKILL.md`.
- The script never claims correctness or authorization — it **only surfaces
  findings** for a human or agent to act on.
- Output is exactly one ` ```review ` fenced JSON block: `{"findings": [...],
  "note": "..."}`, so it composes with any harness that already parses that
  contract (as `domain-check`'s `domain_check.py` and `stats-integrity`'s
  `stats_integrity_check.py` do).

## 1. When to use this mode

- The user wants to harvest paper abstracts, metadata, or citation graphs from
  a journal, preprint server, or aggregator (arXiv, OpenAlex, Semantic Scholar,
  Crossref, publisher sites).
- The user is feeding a `literature-review`, `citation-reviewer`, or
  `traceability-review`-style pipeline and needs the raw source pages first.
- The target may be paywalled, rate-limited, or under a restrictive `robots.txt`
  and the user has not yet confirmed authorization.

For anything else (general web pages, product pages, dashboards), use the
routing table in [intake-packets-and-route-outs.md](intake-packets-and-route-outs.md)
instead — this mode is specifically for research-source harvesting.

## 2. Run the gate before harvesting

```bash
python3 scripts/research_harvest_gate.py "https://arxiv.org/abs/2401.00001" "https://example-journal.org/article/123"
```

The gate is stdlib-only (no `scrapling`, no network dependency beyond
`urllib`) and prints one ` ```review ` fenced JSON block with:

- `robots` findings — whether `robots.txt` disallows the target path, and
  whether a crawl-delay is declared.
- `paywall-heuristic` findings — a heuristic flag (not a guarantee) when the
  domain matches a known subscription-gated publisher, so the harvesting plan
  can be adjusted (metadata-only, open-access mirror, or explicit
  authorization) before fetching full text.
- `note` — the same disclaimer style as `domain-check`: absence of findings is
  not proof of authorization to scrape.

Treat every finding as something to resolve or explicitly accept, not as a
blocker to silently bypass.

## 3. Harvest with the lightest Scrapling mode that fits

Most literature sources are static HTML or return structured metadata (BibTeX,
JSON-LD, OpenAlex/Crossref JSON APIs) — prefer those over rendering a browser:

```python
from scrapling.fetchers import Fetcher

page = Fetcher.get("https://arxiv.org/abs/2401.00001", impersonate="chrome")
title = page.css("h1.title::text").get()
abstract = page.css("blockquote.abstract::text").get()
```

- Prefer a metadata/API endpoint (Crossref, OpenAlex, Semantic Scholar) over
  scraping the rendered abstract page when one exists — this mirrors the
  intake packet's "source of truth" field.
- Escalate to `DynamicFetcher` only if the publisher's abstract/metadata is
  client-rendered.
- Do not escalate to `StealthyFetcher` to defeat a paywall or an
  authentication wall — that is out of scope for this skill; route the user
  to their institutional access or an authorized API instead.

## 4. Feed the output back into a research pipeline

Harvested pages/metadata are typically consumed by a downstream review or
provenance step (as in `academic-research` or an `ai4s-research/open-science`
-style `literature-review` / `citation-reviewer` skill). Keep the handoff
explicit:

- Save extracted text/metadata as Markdown or JSON, not raw HTML, to keep
  downstream context small (`page.css(...).getall()` → structured record).
- Record source URL, fetch timestamp, and the gate's findings alongside the
  harvested content so the downstream pipeline has provenance, not just text.
- If the gate flagged a paywall or a robots disallow, do not silently retry
  with a stealth fetcher — surface the finding and ask the user how they want
  to proceed (skip, use metadata-only, or confirm authorization).

## 5. Failure-language guidance

- "The gate found a robots.txt disallow on this path — I'm not fetching it
  without your explicit confirmation."
- "This domain matches a known paywalled publisher; I can pull open
  metadata (title/abstract/DOI) but not the full text without access."
- "Absence of a gate finding is not proof this scrape is authorized — it only
  means the two checks this script runs did not trigger."
