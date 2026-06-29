# Trend Research via scrapling (Phase 2)

The research team answers "what, and in what tone/structure, would be popular right now?" with data.
Live web extraction — platform rankings, serialization structure, comment-reaction patterns — routes
through the **`scrapling`** skill rather than ad-hoc browser defaults.

> **Compliance first.** Respect each target site's Terms of Service, `robots.txt`, rate limits,
> authorization boundaries, and copyright. Do not scrape behind paywalls/logins you are not
> authorized to access. Gather aggregate patterns, not personal data. When in doubt, fall back to
> `WebFetch` of officially public pages or ask the user for sanctioned sources.

## Why scrapling

Pick the **smallest scraping mode that fits the job** (this is exactly what the `scrapling` skill
routes):

| Need | Scrapling mode |
|------|----------------|
| Parse HTML you already have | parser-only (`Selector`/`Adaptor`) |
| Static ranking/list pages | HTTP fetch (`Fetcher`) |
| JS-rendered rankings/comments | browser fetch (`DynamicFetcher` / `PlayWrightFetcher`) |
| Protected targets | stealth escalation (`StealthyFetcher`) |
| Larger multi-page crawl | Scrapling spiders |

Invoke it via the skill: see [`../scrapling/SKILL.md`](../scrapling/SKILL.md). Typical entry:

```bash
# Activate the scrapling skill's routing, then use the lightest mode.
# Example (parser/HTTP first; escalate only if blocked):
python -c "from scrapling.fetchers import Fetcher; print(Fetcher.get('<public-url>').status)"
```


## What each researcher extracts

- **trend-scout** — genre/trope momentum and lifecycle (rising / peak / declining), genre hybrids,
  and the reader desire behind each trope (vicarious satisfaction, control, fairness, romance).
- **platform-ranker** — rankings by type (popular / paid / new / completed) per platform, per-episode
  length (panel count, scroll length), episode pacing, cliffhanger placement, and the free→paid
  conversion cut-off.
- **audience-analyst** — demographics (labeled as estimates with rationale), immersion drivers, and
  typical drop-off points, coded into repeating patterns.
- **hook-analyst** — reverse-engineered hook/cliffhanger/twist mechanisms across multiple works.

## Output contract

Every researcher writes a markdown file under `01_research/` where **every claim has a source URL and
observation date**. Conflicting sources are both recorded (never silently drop one).
`trend-synthesizer` consolidates these into one actionable `trend-brief.md` — not "romance fantasy is
popular" but "romance-fantasy × regression × cold-revenge tone × identity-reveal twist at episode
end", ready for the scenario team to use directly.
