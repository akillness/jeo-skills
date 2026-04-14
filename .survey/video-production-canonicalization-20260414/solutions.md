# Solution Landscape: video-production canonicalization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Remotion | Code-first / React video framework | Fine-grained control, templates, app embedding, server rendering | Requires engineering skill and render-pipeline ownership | Best fit for explicit Remotion or video-as-code asks |
| Shotstack | Video editing API + workflow platform | Fast automation, templating, API rendering, distribution-friendly | Less flexible than full code for bespoke motion systems | Strong nearby alternative in the same automation lane |
| Creatomate | Template + API media automation | Strong no-code + API bridge, bulk generation, social/tutorial surface | More template-led than code-led | Good evidence that this lane is broader than Remotion alone |
| Bannerbear | Lightweight media generation API | Fast setup for branded image/video automation | Narrower creative ceiling | Useful adjacent comparison, not a full programmable-video framework |
| FFmpeg / custom scripts | Low-level media processing | Powerful primitives, universal availability | Poor authoring UX, high maintenance cost | Common fallback, but not a discovery-friendly skill anchor |
| Manual editors (Premiere / AE / CapCut) | Human-led editing | Best for bespoke polish and taste-heavy timing | Weak for batch personalization and repeated variants | Important route-out for manual finishing work |

## Categories
- **Code-first / programmable video:** Remotion
- **Template/API automation:** Shotstack, Creatomate, Bannerbear
- **Low-level pipeline primitives:** FFmpeg / custom scripts
- **Manual finishing / editorial polish:** Premiere, After Effects, CapCut

## What People Actually Use
Real teams usually run hybrid workflows: template or code-based generation for first-pass output, then manual polish for captions, timing, reframing, and approvals. That means the repo should not advertise two equal Remotion clones. It should advertise one canonical programmable-video workflow plus one explicit Remotion compatibility entry point.

## Frequency Ranking
1. Remotion — strongest code-first mindshare and most precise match for explicit stack mentions
2. Shotstack — strongest API/platform comparator
3. Creatomate — strong no-code + API automation comparator
4. Bannerbear — lightweight automation comparator
5. FFmpeg / custom scripts — infrastructure fallback rather than user-facing skill anchor
6. Manual editors — essential route-out, but not the same operational lane

## Key Gaps
- The repo currently lacks a clear canonical description for programmable / automated video production.
- The Remotion-specific alias does not clearly say that it should resolve into a broader canonical workflow.
- Neither skill has support bundles (`references/`, `evals/`) even though the lane is operationally complex.

## Contradictions
- Market reality: programmable-video work spans code-first, template-first, and hybrid workflows.
- Repo reality: both skill entries currently imply the exact same Remotion-only workflow, which hides the broader automation boundary and makes discovery noisy.

## Key Insight
The bounded fix is not adding another video skill. It is canonicalizing `video-production` as the repository's programmable-video / automated-video anchor, then narrowing `remotion-video-production` into a compatibility alias for explicit Remotion naming and legacy setup surfaces. That preserves discoverability while removing duplicate role claims.
