# Solution Landscape: vibe-kanban structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GitHub Projects + PRs + coding agents | General tracker plus native PR/review surface | Strong planning + review baseline, easy adoption in software teams | No first-class agent workspace orchestration | Common substitute rather than a direct replacement |
| Linear / Jira + coding agents | Existing tracker plus agent execution outside the board | Strong issue hygiene and team adoption | Workspace isolation and review loop still bolted on | Best fit when the tracker is already canonical |
| Trello / Notion + scripts | Lightweight board plus manual glue | Flexible for small teams and solo operators | Weak PR/worktree integration | Often used when a dedicated tool would be overkill |
| OpenHands | Agent workspace platform | Strong coding execution surface | Not primarily a review/kanban control plane | Good adjacent reference, not the same product category |
| MetaGPT / AutoGen / CrewAI / ChatDev | Multi-agent orchestration frameworks | Rich role/task orchestration ideas | Usually framework-first, not board/review-first | Useful for route-outs, not a justification for another wrapper |
| `vibe-kanban` | Board/workspace/review control plane for bounded coding tasks | Closer to the actual control-plane need: cards, workspaces, retries, review, PR handoff | Can sprawl into PM-board territory unless tightly routed | Existing repo anchor; best candidate for bounded improvement |

## Categories
- **General trackers:** GitHub Projects, Linear, Jira, Trello, Notion
- **Coding workspace platforms:** OpenHands
- **Multi-agent orchestration frameworks:** MetaGPT, AutoGen, CrewAI, ChatDev
- **Coding-board control plane:** `vibe-kanban`

## What People Actually Use
In practice, teams usually combine a normal issue board with Git worktrees, tmux/shell helpers, and PR review. That means the biggest real product gap is not "another board," but a tighter explanation of when a coding board adds value beyond GitHub/Linear/Jira and when it should route back to those trackers.

## Frequency Ranking
1. Generic tracker + coding agents + PR review
2. Generic tracker + worktrees/scripts/tmux
3. Multi-agent frameworks without a strong board/review surface
4. Purpose-built AI coding boards such as `vibe-kanban`

## Key Gaps
- Board tools rarely unify tracker state, workspace state, retry state, and PR handoff cleanly.
- Many workflows still need explicit cleanup and review rules because vendor promises stop at execution.
- The market still over-indexes on agent generation and under-specifies review queue and worktree hygiene.

## Contradictions
- Marketed claim: dedicated AI boards should simplify multi-agent work.
- User reality: many teams still trust generic trackers plus manual Git/worktree discipline more than a new control plane.

## Key Insight
The best bounded improvement is not creating another orchestration or board wrapper. It is making `vibe-kanban` more explicit about its thin, high-value layer: a coding-board/workspace/review control plane that sits on top of generic trackers and standard PR review, while routing planning-only, browser-only, and non-code coordination work outward.
