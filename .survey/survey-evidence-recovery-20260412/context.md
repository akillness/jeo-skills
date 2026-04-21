# Context: survey evidence recovery hardening

## Workflow Context
The `survey` skill sits at the front of the repository's maintenance loop: it decides whether a new skill is needed, whether an existing skill should be consolidated, and which evidence is strong enough to justify a patch. That means brittle evidence recovery hurts every downstream lane across CLI/developer workflow, web development, product planning, marketing, and game development. Repo history already shows this pressure: several prior survey artifacts explicitly documented `401 Invalid API key` failures and switched to direct page retrieval or browser-rendered indexed snippets instead of abandoning the run. The current pain is not that the skill lacks a survey structure; it is that the fallback guidance is still too thin and too easy to apply inconsistently.

This problem shows up whenever a run depends on live web evidence and one of three things happens: (1) search/extract APIs fail or are unavailable, (2) the referenced page has drifted or 404s, or (3) the source is only partially recoverable through search-engine snippets or browser rendering. Existing artifacts such as `.survey/steam-marketing-boundary/context.md`, `.survey/game-ci-cd-pipeline/context.md`, and `.survey/game-demo-feedback-triage-20260412/context.md` already demonstrate ad hoc use of direct retrieval and indexed snippets. The improvement opportunity is to make that workflow first-class, portable, and explicit inside the `survey` skill itself.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill-maintenance agent | Research gaps, duplicates, and upgrade candidates before editing `.agent-skills` | Advanced |
| Repo maintainer | Trust that new or updated skills are grounded in real workflow evidence | Intermediate |
| Cross-platform agent operator | Reuse the same survey behavior across Claude, Codex, Gemini, and generic agent workflows | Intermediate |
| Downstream planning/orchestration agent | Consume `.survey/{slug}` artifacts as reliable pre-planning input | Intermediate |

## Current Workarounds
1. **Direct primary-page retrieval with a browser-like User-Agent** — prior runs already use this when web APIs fail, because it keeps the agent on the primary source and often recovers titles, descriptions, or keyword presence with low cost. Limitation: direct retrieval can still hit SSL/certificate errors or JavaScript-heavy pages.
2. **Browser-rendered indexed snippets** — prior runs use browser-visible search snippets when the original page or social post is inaccessible. Limitation: snippets are useful but lossy, so the evidence needs explicit confidence labeling.
3. **Fallback to stable vendor/use-case pages** — when a blog or forum URL drifts, maintainers substitute durable product or documentation pages. Limitation: this can recover workflow context, but it may underrepresent user pain compared with community discussion.
4. **Manual evidence-quality notes in survey artifacts** — recent runs sometimes label confidence and evidence type. Limitation: the practice is inconsistent because the skill does not yet prescribe a concrete ladder or support file.

## Adjacent Problems
- Weak evidence recovery can make duplicate/consolidation decisions look arbitrary rather than grounded.
- Search/tool outages push agents toward unverified prior knowledge unless the fallback path is explicit.
- Different platforms expose retrieval controls differently, so the same research task can behave inconsistently without a normalized settings/rules/hooks model.
- Repeated rediscovery of fallback tactics wastes time that could be spent on actual skill improvement.

## User Voices
- "Web search API returned `401 Invalid API key`, so this survey used direct page retrieval with a browser-like User-Agent and repo inspection." Source: `/Users/jang_jennie/projects/oh-my-skills/.survey/steam-marketing-boundary/context.md`
- "Evidence confidence: high for repo-state observations and retrieved page titles/snippets; medium for broader market-frequency claims because no community/forum lane was live-verified this run." Source: `/Users/jang_jennie/projects/oh-my-skills/.survey/steam-marketing-boundary/context.md`
- "This run's normal web search/extract tools returned authentication failures, so the survey leaned on stable official documentation and reproducible ecosystem patterns instead of live community-thread extraction." Source: `/Users/jang_jennie/projects/oh-my-skills/.survey/game-build-log-triage-20260412/context.md`
- Google documents that search snippets are derived from the page content and other indexing signals, which makes snippets useful as recovery evidence but not a full substitute for the primary page. Source: https://developers.google.com/search/docs/appearance/snippet (`direct page retrieval via curl`, confirmed HTTP 200 in this run)
- Python documents `urllib.request` as a standard way to fetch URLs and customize request headers, which supports a lightweight direct-retrieval fallback before escalating to heavier browser tooling. Source: https://docs.python.org/3/library/urllib.request.html (`direct page retrieval via curl`, confirmed HTTP 200 in this run)
