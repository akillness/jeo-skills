# Solution Landscape: API documentation modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| OpenAPI | Contract/spec format | Common interchange layer; broad tooling support | Does not guarantee good examples or narrative guidance | Stable anchor for spec-first docs |
| Swagger UI | Interactive reference rendering | Familiar UI; quick to publish | Generated output alone feels thin without curated examples | Useful for reference surface, not the whole workflow |
| Redoc / Redocly | Branded reference + portal workflows | Better presentation and governance layers | Can drift from implementation if ownership is weak | Good for publishing boundary |
| Mintlify | Hosted docs / developer portal | Friendly docs-site UX and search | Platform-specific; not a universal workflow | Good example of portal-as-product |
| Docusaurus API docs | Docs-site integration | Fits docs-as-code teams | Requires editorial ownership | Shows docs-site + generated-reference hybrid |
| Postman collections / curl snippets | Example and testing companion artifacts | Easy to prove working examples | Often drift when maintained separately | Common workaround layer |
| Integration tests as example source | Behavior-backed examples | Examples can stay truthful | Hard to present directly to readers | Important drift-prevention tactic |

## Categories
1. **Source of truth** — spec-first, code-first, or hybrid.
2. **Reference rendering** — Swagger UI, Redoc/Redocly, docs-site plugins.
3. **Example strategy** — curl snippets, SDK samples, test-backed examples, Postman collections.
4. **Developer guidance** — auth setup, errors, pagination, rate limits, webhook verification, migration notes.
5. **Publishing + maintenance** — docs portal ownership, review loops, drift checks, release/update hygiene.

## What People Actually Use
Most teams use a hybrid workflow:
- generate or update a contract/spec
- render reference docs from it
- manually add examples, auth notes, edge cases, and migration guidance
- borrow sample payloads from tests or real requests
- patch stale docs after releases when portal content drifts

## Frequency Ranking
1. OpenAPI / spec-driven workflows
2. Swagger UI / Redoc-style reference rendering
3. Docs-site / portal publishing layers
4. Manual example curation from tests or Postman
5. Drift-prevention checks and release/update hygiene

## Key Gaps
- Many solutions handle rendering, not boundary-setting between contract design, developer docs, internal docs, and user docs.
- Generated references still need explicit guidance for auth, errors, versioning, migration, and “getting started as an integrator.”
- Example truthfulness and drift prevention remain manual unless the team ties docs back to tests/specs/release review.

## Contradictions
- Marketed claim: “Generate docs from your spec and you are done.”
- User reality: teams still maintain examples, onboarding notes, auth caveats, and portal structure by hand.
- Marketed claim: “One docs platform covers all documentation jobs.”
- User reality: internal technical docs, API portals, customer help, and release notes still need separate route-outs.

## Key Insight
`api-documentation` is strongest when treated as the developer-facing publication layer between API contract design and downstream integration success. The reusable workflow is not vendor selection; it is choosing the source of truth, shaping truthful examples, documenting auth/errors/versioning, publishing to the right surface, and keeping the docs from drifting after releases.
