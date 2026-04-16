# Solution Landscape: remotion-video-production support hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Remotion docs | Code-first React video stack with compositions, parameterized props, player/runtime embedding, rendering, and deployment surfaces | Best source for explicit Remotion requests; directly explains compositions, parameterized videos, and `@remotion/player` | Too broad for repo-local alias routing; not a compact compatibility packet | <https://www.remotion.dev/docs>, <https://www.remotion.dev/docs/parameterized-rendering>, <https://www.remotion.dev/docs/player/> |
| Shotstack docs | JSON + REST cloud rendering and asset-editing workflow | Strong comparator for API-first / mass-personalization route-outs | Different operating model from React/Remotion; not the right default for explicit Remotion asks | <https://shotstack.io/docs/guide/> |
| Creatomate docs | Spreadsheet, API, and no-code automation workflows for bulk/personalized media | Strong comparator for template-first and non-code routes | Broader automation platform, less specific about React/code-first composition | <https://creatomate.com/docs/fundamentals/getting-started/introduction> |
| Current canonical skill | `video-production` already has production modes, asset/QA, and handoff support docs | Correct canonical owner for the lane; already routes between code-first and alternative modes | Alias users must mentally jump into the canonical folder to recover support detail | `.agent-skills/video-production/` |
| Current alias skill | `remotion-video-production` already resolves to `video-production` and keeps eval coverage | Good boundary, lightweight alias behavior, existing compact surface | Missing `references/` packet leaves support asymmetry with other alias lanes | `.agent-skills/remotion-video-production/` |

## Categories
- **Canonical stack docs** — Remotion for explicit code-first programmable-video requests.
- **Alternative workflow comparators** — Shotstack and Creatomate for API-first, template-first, bulk, or no-code automation paths.
- **Repo-local routing layer** — `video-production` as the canonical owner and `remotion-video-production` as the compatibility shim.

## What People Actually Use
Teams with explicit Remotion asks still need concrete stack language around compositions, props, rendering, and the player, but the broader video-automation market keeps mixing code-first stacks with API/template systems. That means the alias should not become a second fully fledged skill. The practical repo-local answer is a tiny support packet that (a) reaffirms canonical routing, (b) explains why code-first is the default for the alias, and (c) shows the route-out triggers when template/API automation is actually the better fit.

## Frequency Ranking
1. Remotion docs for explicit code-first workflows
2. Repo-local canonical `video-production` support packet
3. Shotstack docs for API-first mass rendering
4. Creatomate docs for spreadsheet/no-code/API automation

## Key Gaps
- `remotion-video-production` remains support-asymmetric with the other alias lanes because it has no `references/` docs.
- Compact and human-readable alias guidance can drift if the alias relies only on a short `SKILL.md` and old compact text.
- The lane needs a clearer alias-side explanation of when to stay in Remotion and when to route back to template/API automation.

## Contradictions
- Remotion is presented as a rich end-to-end programmable-video platform, but the repo should not mirror all that detail in the alias because the canonical owner is `video-production`.
- API/template platforms market scale and personalization strongly, but that does not erase the need for a code-first alias when a prompt explicitly names Remotion, React components, or runtime player embedding.

## Key Insight
The best bounded improvement is to harden `remotion-video-production` in place with two small alias-side reference docs and refreshed compact wording, not to create another media skill or expand the alias into a second canonical video workflow. That preserves the settled cluster boundary while making explicit Remotion requests easier to route correctly.
