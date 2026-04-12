# Evidence Recovery Ladder for `survey`

Use this note when a survey lane cannot rely on normal web-search or page-extract tooling.

## 1. Direct primary-page retrieval
Start with the canonical or most likely primary URL.

Recover at least:
- final URL / redirect target
- `<title>`
- meta description (if present)
- exact keyword presence for the claim you want to make

Recommended lightweight pattern:
- `python3` + `urllib.request`
- browser-like `User-Agent`
- note the recovery as `direct page retrieval`

Good for:
- vendor docs
- standards pages
- product/use-case pages
- stable reference material

## 2. Stable official substitution
If a cited blog/resource URL 404s or drifts:
- prefer a durable official page that still covers the same workflow
- record that the original URL drifted
- do **not** pretend the substitute is the same document

Good for:
- product overview pages replacing dead announcement posts
- stable docs replacing drifted blog links

## 3. Structured publication fallback
If the site exposes a feed:
- check RSS / Atom autodiscovery or common feed endpoints
- recover canonical links, timestamps, and summaries
- treat feed summaries as weaker than the full page unless they include the full content

Record as:
- `feed recovery`
- `direct page retrieval via feed-discovered URL`

## 4. Browser-rendered retrieval
Escalate here when:
- direct fetch returns incomplete HTML
- the page is JS-rendered
- anti-bot noise hides the real content
- redirect/cookie behavior matters

Use a browser view to recover:
- visible title/snippet text
- rendered result blocks
- network/API endpoints if needed

Record as:
- `browser-rendered retrieval`

## 5. Indexed snippet recovery
Use when the primary page or social post is not directly recoverable but search results still expose useful text.

Rules:
- label explicitly as `indexed snippet` or `browser-rendered indexed snippet`
- include confidence: `high`, `medium`, or `low`
- use snippets for existence/topic/workflow phrasing, not as a perfect substitute for the full source

Confidence hints:
- **high** — URL + snippet recovered in the same run
- **medium** — platform/page inferred but original page not opened
- **low** — generic snippet with little workflow detail

## 6. Thin-evidence stop
If all recovery paths remain weak:
- say the evidence is thin
- preserve what was recovered
- continue the survey without inventing certainty
- downgrade the claim to a hypothesis if needed

## Provenance labels
Use one of these labels in the survey artifact:
- `direct page retrieval`
- `feed recovery`
- `browser-rendered retrieval`
- `indexed snippet`
- `browser-rendered indexed snippet`
- `unverified prior knowledge`

## Practical reminders
- Cheap-first escalation beats going straight to a full browser.
- Prefer primary sources over tertiary summaries when the claim matters.
- Stable official pages are often better than dead blog guesses.
- Snippets are useful, but they must stay visibly lower-confidence than direct retrieval.
