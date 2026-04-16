# Context: remotion-video-production support hardening

## Workflow Context
The repo already made `video-production` the canonical programmable-video / automated-video anchor and narrowed `remotion-video-production` into a compatibility alias, but the alias still has no `references/` packet while the canonical skill does. Repo-local evidence shows the lane boundary is stable: `video-production` owns code-first, template/API, repurposing, and QA handoff work, while `remotion-video-production` exists only for explicit Remotion naming and legacy setup surfaces (`.agent-skills/video-production/SKILL.md`, `.agent-skills/remotion-video-production/SKILL.md`, `.agent-skills-wiki/queries/video-production-canonicalization-2026-04-14.md`). Browser-rendered primary page evidence from Remotion shows why explicit Remotion requests keep appearing: the docs foreground creating projects, parameterized videos, rendering, server-side rendering, Cloud Run/Lambda deployment, and the embeddable `@remotion/player` for runtime customization (<https://www.remotion.dev/docs>, <https://www.remotion.dev/docs/parameterized-rendering>, <https://www.remotion.dev/docs/player/>).

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Agent maintaining old prompts or setup surfaces | Preserve exact-name compatibility while steering to the canonical skill | Intermediate |
| Developer choosing a programmable-video stack | Decide whether the ask is truly Remotion/code-first or should route to broader video-production modes | Intermediate to advanced |
| Product / content operator | Needs a reusable packet for assets, render stack choice, QA, and handoff without learning the entire video lane | Mixed |
| Repo maintainer | Keep alias skills lightweight, non-duplicative, and support-symmetric with other canonical/alias pairs | Advanced |

## Current Workarounds
1. Read the alias `SKILL.md` and mentally translate it back into the canonical `video-production` workflow with code-first mode selected.
2. Jump into `video-production/references/` to recover the richer packet for production modes, asset/QA checklists, and handoff boundaries even when the prompt explicitly names Remotion.
3. Use Remotion docs directly to recover stack-specific concepts such as compositions, parameterized props, the player, and deployment/runtime surfaces (<https://www.remotion.dev/docs>, <https://www.remotion.dev/docs/parameterized-rendering>, <https://www.remotion.dev/docs/player/>).
4. Compare against template/API platforms when the user actually needs faster bulk rendering, spreadsheet/no-code workflows, or mass personalization instead of owning a React video codebase. Shotstack presents JSON + REST video editing/rendering for developers and mass personalization in the cloud, while Creatomate presents spreadsheet, API, and no-code automation choices for bulk and personalized video generation (<https://shotstack.io/docs/guide/>, <https://creatomate.com/docs/fundamentals/getting-started/introduction>).

## Adjacent Problems
- Alias skills drift fastest in compact discovery surfaces, so support-free aliases are more likely to regress into stale standalone clones.
- Explicit Remotion requests often mix two jobs: stack choice and workflow planning. Without a small reference packet, the alias can over-own stack details or under-explain route-outs to template/API automation.
- The game/media lane shares launch-content and asset-packet concerns with broader marketing workflows, but that does not justify reviving `remotion-video-production` as a second canonical media skill.

## User Voices
- Remotion docs: "Remotion allows for ingesting, validating, visually editing, and transforming data that may be used to parametrize a video." (<https://www.remotion.dev/docs/parameterized-rendering>)
- Remotion docs: "Using the Remotion Player you can embed Remotion videos in any React app and customize the video content at runtime." (<https://www.remotion.dev/docs/player/>)
- Shotstack docs: "Shotstack is a platform for editing videos, using code, that enables developers, marketers, and designers to automate the generation of videos at scale." (<https://shotstack.io/docs/guide/>)
- Creatomate docs: "Creatomate is a platform for creating videos and images through automation... from simple spreadsheet-based workflows to advanced API integrations." (<https://creatomate.com/docs/fundamentals/getting-started/introduction>)
