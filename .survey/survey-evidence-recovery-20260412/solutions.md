# Solution Landscape: survey evidence recovery hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Direct primary-page retrieval | Fetch the canonical URL directly, then retry with a browser-like `User-Agent` and standard headers if needed | Cheap, stays on the primary source, often enough for title/meta/keyword recovery | Can still fail on SSL/cert issues, anti-bot checks, or JS-only content | Backed by Python `urllib.request` docs and already used in prior repo surveys |
| RSS / Atom fallback | Recover source URLs and summaries from feeds or feed archives | Structured, low-friction, often preserves timestamps and canonical links | Not every site exposes feeds; some feeds are summary-only | Best as a machine-readable recovery layer when available |
| Browser-rendered indexed snippets | Use visible search-result snippets/titles when direct retrieval fails | Useful for confirming existence, phrasing, and workflow language | Lossy and lower-confidence than the primary page | Should be labeled explicitly as indexed-snippet evidence |
| Stable vendor / use-case page substitution | Replace dead or drifting blog links with product, vendor, or official use-case pages | Durable, reproducible, and often enough to recover workflow structure | Can underrepresent lived pain or edge-case workarounds | Better than grinding on dead links with no recovery path |
| Browser / DevTools inspection | Escalate to a real browser to inspect the rendered page or network activity | Strong recovery path for JS-heavy pages and embedded API payloads | Manual, slower, and higher-cost than lightweight retrieval | Good late-stage escalation, not the first retry |
| Explicit fallback hierarchy | Encode the retrieval order and evidence labels into the skill itself | Portable, auditable, and easier to reuse across runs/platforms | Requires maintainers to keep the hierarchy crisp | Highest-leverage repo change because it improves every future survey |

## Categories
### Primary-source recovery
- Direct primary-page retrieval
- Browser / DevTools inspection

### Structured alternative surfaces
- RSS / Atom fallback
- Stable vendor / use-case page substitution

### Indexed recovery
- Browser-rendered indexed snippets

### Orchestration pattern
- Explicit fallback hierarchy

## What People Actually Use
In practice, maintainers do not rely on one magical research surface. They stack cheap, legible workarounds: first direct retrieval of the primary page, then browser-like headers, then feed discovery or stable official pages, and only then browser-rendered snippets or manual inspection. This exact repo already behaves that way in prior survey runs. The market pattern lines up: practitioners still use RSS for durable monitoring, direct header-tuned fetches for brittle pages, DevTools for JS-heavy sites, and snippet/archive recovery when the live page is partially inaccessible.

## Frequency Ranking
1. **Direct primary-page retrieval with browser-like headers** — most common first fallback because it is cheap and keeps evidence closest to the source.
2. **Explicit fallback hierarchy** — the most important structural pattern because it determines whether the survey completes cleanly instead of stalling.
3. **Browser-rendered indexed snippets** — common when the source is inaccessible or only partially visible.
4. **RSS / Atom fallback** — high-value where present, but not universal enough to be the default second step.
5. **Browser / DevTools inspection** — effective but intentionally heavier-weight.
6. **Stable vendor / use-case page substitution** — essential for link drift, but a narrower recovery pattern than the items above.

## Key Gaps
- The `survey` skill already encourages source-backed claims, but it does not yet prescribe a concrete recovery ladder with explicit evidence labels.
- Prior repo runs use direct retrieval and indexed-snippet tactics, but the knowledge is trapped in artifacts instead of being first-class survey guidance.
- There is no dedicated `references/` or `evals/` support for `survey`, which makes trigger quality and fallback behavior harder to preserve.
- SSL/certificate failures and redirect drift are real failure modes in direct retrieval, yet they are not clearly handled in the current instructions.

## Contradictions
- Marketed research tooling suggests a single search/extract pipeline can cover most discovery, but actual maintenance work still falls back to direct fetches, browser rendering, and snippets when those pipelines fail.
- Product/vendor pages are more durable than blog posts, but they are not always the best source of user pain; the skill needs both durability guidance and evidence-confidence labeling rather than pretending one source type solves everything.

## Key Insight
The highest-leverage improvement is not adding another research feature. It is codifying the evidence-recovery ladder the repo already improvises: try the primary page first, escalate intentionally, label the evidence type, and preserve a clean distinction between direct retrieval, browser-rendered indexed snippets, and thin/unverified knowledge. That turns recurring failure-handling into reusable survey behavior.

## Curated Sources
- Python `urllib.request` documentation — https://docs.python.org/3/library/urllib.request.html (`direct page retrieval via curl`, confirmed HTTP 200 in this run)
- Google Search Central snippet documentation — https://developers.google.com/search/docs/appearance/snippet (`direct page retrieval via curl`, confirmed HTTP 200 in this run)
- Chrome DevTools network documentation — https://developer.chrome.com/docs/devtools/network/ (`direct page retrieval via curl`, confirmed HTTP 200 in this run)
- Anthropic Claude Code hooks documentation — https://code.claude.com/docs/en/hooks (original `docs.anthropic.com` URL redirected here with HTTP 301 in this run)
- Anthropic Claude Code settings documentation — https://code.claude.com/docs/en/settings (original `docs.anthropic.com` URL redirected here with HTTP 301 in this run)
- Atom Syndication Format (RFC 4287) — https://datatracker.ietf.org/doc/html/rfc4287
- Feed Paging and Archiving (RFC 5005) — https://www.rfc-editor.org/rfc/rfc5005
