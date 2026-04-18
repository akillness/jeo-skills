# Solution Landscape: task-estimation structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Atlassian estimation guidance | Story points + planning poker + relative estimation primer | Canonical mainstream explanation; clear on relative estimation and impact-oriented planning | Broad and tool-ecosystem flavored; does not solve misuse by itself | Primary-source workflow framing |
| Scrum.org story-points debate | Story points as conversation starter with shared baseline | Honest about debate and calibration needs | Still Scrum-centric; less actionable on cross-functional edge cases | Good evidence for keeping confidence/calibration visible |
| Mountain Goat “don’t use story points for sprint planning” | Separate long-term measure from short-term sprint decision | Strong warning against mixing horizons | Opinionated; may overfit some teams | Useful route-out for forecast vs sprint packet separation |
| John Cutler PM note | PM-facing anti-misuse framing | Strong language on abuse/misuse; useful for forecast-safe wording | Blog/opinion format rather than formal method | Good evidence that stakeholder translation remains a live pain |
| Rami Ismail prototype / vertical slice | Estimate the right artifact first in game work | Excellent for discovery-vs-delivery separation and milestone realism | Game-specific framing needs translation for non-game work | Important cross-domain route-out for game-development prompts |
| Planning-poker SaaS tools (Story Point Poker, PlanningPoker.live, ScrumVote, EstimatePoker) | Real-time collaborative estimation sessions | Frequent, lightweight, good for team voting rituals | Mostly solve voting mechanics, not uncertainty language or boundary design | Tool category repeats, but does not replace a strong skill packet |

## Categories
- **Method primers:** Atlassian, Scrum.org, Mountain Goat
- **Behavior / misuse framing:** John Cutler, indexed Reddit discussion, anti-story-point essays
- **Game / milestone alternatives:** Rami Ismail prototype and vertical-slice framing
- **Collaboration tools:** planning-poker SaaS products and comparison pages

## What People Actually Use
Teams still use a mix of story points, coarse buckets, planning poker sessions, and ad hoc stakeholder translation. The recurring manual workaround is not choosing a tool; it is writing a second layer of context around the number: confidence, assumptions, missing discovery, and what the estimate should not be used for. For game or milestone work, teams often switch artifacts entirely and estimate the prototype/spike/vertical slice instead of the imagined full feature.

## Frequency Ranking
1. Story points / planning poker remain the dominant estimation ritual across mainstream agile guidance.
2. Confidence / calibration / baseline warnings show up repeatedly in primary guidance and discussion.
3. Anti-misuse and anti-deadline complaints recur in indexed discussion and PM commentary.
4. Tool vendors mostly optimize the estimation meeting itself, not cross-functional or forecast-safe packet quality.
5. Game-development alternatives emphasize estimating prototypes and vertical slices before full milestone promises.

## Key Gaps
- Most solution surfaces explain estimation rituals but not the routing boundary between sizing, sprint planning, and forecast translation.
- Tooling solves consensus collection more than estimate-packet quality.
- Cross-functional and game-delivery burdens are usually underrepresented in generic software-estimation primers.
- Compact discovery surfaces can easily regress into “story points + planning poker” shorthand and lose the repo’s stronger anti-misuse contract.

## Contradictions
- Marketed guidance treats story points as helpful planning structure, while discussion snippets and practitioner essays warn that they are frequently abused as deadline or performance instruments.
- Planning-poker tools promise smoother estimation sessions, but real teams still need manual translation for uncertainty, scope cuts, and stakeholder communication.
- Sprint planning often consumes story-point outputs even when Mountain Goat and similar guidance say those points are not the right short-term decision primitive.

## Key Insight
The best bounded win is not adding another forecasting or planning-poker wrapper. It is shrinking `task-estimation` into a tighter routing-first estimate-packet anchor that chooses one estimation horizon, preserves confidence and misuse guardrails, and routes planning / forecasting / retrospective work outward. The market already has enough estimation primers and planning-poker tools; the missing surface is a compact operator packet that keeps the number honest.
