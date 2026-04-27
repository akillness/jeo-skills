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
- `thin evidence`

## Practical reminders
- Cheap-first escalation beats going straight to a full browser.
- Prefer primary sources over tertiary summaries when the claim matters.
- Stable official pages are often better than dead blog guesses.
- Snippets are useful, but they must stay visibly lower-confidence than direct retrieval.

## GitHub-heavy survey fallback (keyword scans)
When the survey topic is mostly GitHub repositories and search reliability drops (API auth failure, secondary rate limits, noisy keyword matches):
1. Keep keyword-search evidence, but label it as `browser-rendered retrieval` and treat it as discovery, not final truth.
2. Re-verify shortlisted candidates via direct repo pages/API (`direct page retrieval`) for stars, license, archived status, and recent updates.
3. Prefer authenticated `gh api` retrieval when available to reduce unauthenticated rate-limit failures.
4. If one keyword surface is too noisy (common for frontend/backend/game "skill" queries), use stable seed repos that match the workflow intent and state that this is a quality filter, not keyword-only ranking.
5. If sandbox TLS trust is broken (`CERTIFICATE_VERIFY_FAILED`), use an unverified SSL context only for non-destructive metadata retrieval, and explicitly flag this as risk in artifacts/reports.

### Keyword sweep quality rescue matrix (hourly maintenance)
When hourly runs require fixed keyword coverage (`agentic ai skill`, `web frontend skill`, `web backend skill`, `cli open source skill`, `game development skill`), use this matrix before selecting a candidate:

| Keyword bucket | Suggested seed repos (example) | Keep signals | Drop/risk signals |
|---|---|---|---|
| agentic ai skill | `langchain-ai/langgraph`, `microsoft/autogen`, `crewAIInc/crewAI` | active maintenance, explicit agent orchestration docs, permissive license | archived repos, model wrappers with no workflow guidance |
| web frontend skill | `vercel/next.js`, `sveltejs/svelte`, `vuejs/core` | framework/runtime relevance to UI workflows, recent pushes | generic UI collections without operational workflow |
| web backend skill | `fastapi/fastapi`, `django/django`, `nestjs/nest` | production backend patterns (API/auth/testing/deploy) | sample-only repos, dummy API datasets, missing license |
| cli open source skill | `junegunn/fzf`, `charmbracelet/gum`, `sharkdp/bat` | clear CLI operator value, documented commands, active releases | listicle/meta repos, shell config bundles unrelated to target workflow |
| game development skill | `godotengine/godot`, `bevyengine/bevy`, `MonoGame/MonoGame` | reproducible build/test/export workflows, active engine docs | archived game lists, showcase-only repos without operator workflow |

### Mandatory metadata + fit rationale before proposing
For each kept candidate, record:
- `license` (or explicit missing-license risk)
- `pushed_at`
- `archived`
- `open_issues`
- `forks`
- one-line fit rationale tied to the exact skill scope
- if `open_issues`/`forks` are missing on first pass, hydrate once via `gh api repos/<owner>/<repo> --jq '{open_issues: .open_issues_count, forks: .forks_count}'`

Do not promote a candidate to TOP proposals when it fails metadata minimums unless the report labels it explicitly as risk/experimental.
