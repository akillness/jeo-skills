# Context: task-estimation structural hardening

## Workflow Context
`task-estimation` sits between fuzzy planning inputs and commitment-heavy delivery conversations. Atlassian's estimation guide frames story points as a way to optimize for impact and efficiency rather than time-based promises, while Scrum.org explicitly positions story points as conversation starters that depend on a shared baseline rather than as universal truth. In practice, PMs, developers, and game teams still need one compact estimate packet that preserves uncertainty, separates discovery from delivery, and routes the next job outward instead of collapsing planning, forecasting, and scheduling into one blob.

Primary sources:
- Atlassian: https://www.atlassian.com/agile/project-management/estimation
- Scrum.org: https://www.scrum.org/resources/blog/story-points-estimate-or-not-estimate
- John Cutler: https://cutle.fish/blog/can-you-stop-using-story-points/
- Rami Ismail: https://ltpf.ramiismail.com/prototypes-and-vertical-slice/
- Mountain Goat Software: https://www.mountaingoatsoftware.com/blog/why-i-dont-use-story-points-for-sprint-planning

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Engineering lead / EM | Convert candidate work into relative size signals and risk language for sprint or milestone decisions | Intermediate to advanced |
| PM / product ops | Compare roadmap slices without turning point totals into hard promises | Intermediate |
| GTM / operations owner | Estimate cross-functional launch or enablement packets with approvals and follow-through burden visible | Intermediate |
| Game producer / lead | Separate prototype, vertical-slice, polish, QA, and release-readiness effort before a demo or milestone | Intermediate to advanced |
| AI coding agent | Produce one bounded estimate brief with confidence and route-outs instead of inventing schedules | Mixed |

## Current Workarounds
1. Teams use story points or planning poker as a rough internal shorthand, then manually translate the result into date/scope language for stakeholders.
2. When uncertainty is high, experienced operators fall back to spikes, prototypes, or vertical-slice style validation work instead of pretending the whole implementation is estimable.
3. Cross-functional or game-delivery work often gets broken into side notes for QA, approvals, content, and release tasks because the main estimate number hides too much non-code work.
4. Product leads often keep a second explanation layer outside the estimate itself to explain confidence, assumptions, and what the estimate should not be used for.

## Adjacent Problems
- Story points are routinely misused as deadline commitments or management performance metrics.
- Sprint planning, forecasting, and estimation are often blended even though short-term commitment and longer-term trend forecasting need different packets.
- Discovery-heavy work gets overpromised unless the spike/prototype is estimated separately from final implementation.
- Game and launch work carry QA/content/release burden that generic software-estimation language often hides.

## User Voices
- John Cutler warns PMs not to be “complicit in abuse/misuse” of story point estimation and treats the debate as long-running operational reality, not solved doctrine. Source: https://cutle.fish/blog/can-you-stop-using-story-points/
- Yahoo Japan indexed Reddit snippet for `r/agile` captures the same operational boundary: “Story points are a relative way for one team to quickly decide internally how much to commit to for a single sprint. Any attempt by managers to ...” Source type: Yahoo Japan indexed snippet pointing to https://www.reddit.com/r/agile/comments/1dr7s32/estimations_are_wasteful_story_points_are_a/
- Mountain Goat's position is a useful counterweight for behavior-in-practice: story points are “a useful long-term measure” but “not useful in the short term” for sprint planning. Source: https://www.mountaingoatsoftware.com/blog/why-i-dont-use-story-points-for-sprint-planning
- Rami Ismail's prototype vs vertical-slice framing matters for game work because many teams still mix up “can we make this game?” and “can we make it?” and lose time/money by estimating the wrong artifact. Source: https://ltpf.ramiismail.com/prototypes-and-vertical-slice/
