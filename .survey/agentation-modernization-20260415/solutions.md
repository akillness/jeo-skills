# Solution Landscape: agentation modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| `agentation` | Human-in-the-loop UI annotation toolbar + MCP/watch loop | Exact selectors and UI feedback packets, strong fit for browser-to-code handoff | Easy to sprawl into platform config dumps without support docs | Best bounded repo target this run |
| `agent-browser` | Fresh-session browser verification | Deterministic refs, repeatable QA runs, isolated verification | Not for shared running-browser state or human annotation packets | Clear route-out from `agentation` |
| `playwriter` | Running-browser / authenticated-session automation | Reuses current browser state, good for SSO/MFA/manual handoff | Less deterministic, not the default browser verifier | Clear route-out from `agentation` |
| `plannotator` | Browser-based review of plans and diffs | Strong approval gate for artifacts before implementation | Not a UI annotation tool | Adjacent planning-review anchor |
| Copy-paste screenshots / comments | Manual fallback | Low setup cost | Weak code targeting, inconsistent structure, easy ambiguity | Common workaround that `agentation` improves |

## Categories
- **UI feedback capture:** `agentation`, manual screenshots/comments
- **Browser verification:** `agent-browser`, `playwriter`
- **Artifact review / approval:** `plannotator`
- **Platform integration / hooks:** agent-specific MCP setup, config hooks, and watch-loop automation

## What People Actually Use
In practice, people mix a browser verifier, a human feedback loop, and a targeted fix step. The clean structure is: verify behavior (`agent-browser` or `playwriter`) → annotate exact UI problems (`agentation`) → send the packet to the coding agent → re-verify. Weak skills fail because they present all tooling as one giant catalog instead of clarifying when the user wants exact UI feedback versus fresh-browser verification versus running-browser reuse.

## Frequency Ranking
1. `agentation` — highest repo leverage because it is already indexed in JEO, README, and setup surfaces but lacks support files.
2. `agent-browser` — stable adjacent verifier; already more mature than `agentation`.
3. `playwriter` — important neighboring browser lane, already modernized.
4. `plannotator` — approval gate, already modernized.
5. Manual screenshot/comment workflows — still common, but not a skill to add.

## Key Gaps
- No skill-local references for platform setup, watch-loop/self-driving workflows, or routing across adjacent browser/review tools.
- No evals ensuring that `agentation` triggers for UI annotation work rather than generic browser automation or plan review.
- Discovery-surface drift obscures the current repo size and weakens onboarding trust.

## Contradictions
- Marketed reality: `agentation` is a focused agent-agnostic UI feedback bridge.
- Current repo reality before this run: the skill read like a very large install/config/command catalog, which diluted the routing message and boundary clarity.

## Key Insight
The strongest improvement is not adding another browser or QA wrapper. It is making `agentation` shorter, sharper, and explicitly routed: `plannotator` reviews plans/diffs, `agent-browser` verifies fresh-session browser behavior, `playwriter` reuses the user's real browser, and `agentation` owns exact UI feedback packets plus the human/agent handoff loop.
