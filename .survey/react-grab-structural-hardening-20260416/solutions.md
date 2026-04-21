# Solution Landscape: react-grab structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Keep `react-grab` as-is | No structural change | Zero work | Leaves 494-line front-door skill and stale Node requirement in helper scripts | Reject |
| Add another adjacent browser/frontend wrapper | New skill for install/setup or MCP usage | Might shrink the original skill indirectly | Creates duplicate trigger surface and violates current repo direction toward consolidation | Reject |
| Split `react-grab` into a smaller routing-first `SKILL.md` plus focused references, and sync scripts/evals | Keep one skill, move setup/workflow/API detail into support docs, fix stale prerequisites, refresh evals/compact copy | Preserves canonical name, reduces front-door density, improves accuracy, keeps discovery clean | Requires coordinated edits across skill/support/evals/wiki/graph artifacts | **Accept** |
| Collapse `react-grab` into broader browser skills | Route all element-context work into `agent-browser` / `agentation` | Fewer files | Loses precise React-specific capability and hides a legitimate tool-specific workflow | Reject |

## Categories
- **Do nothing**: low effort, low value, leaves drift in place.
- **Duplicate wrapper**: high confusion risk, poor fit for current consolidation policy.
- **In-place structural hardening**: best bounded win.
- **Over-merge into broader browser lane**: wrong abstraction; removes a real specialized skill.

## What People Actually Use
Repo-local evidence and upstream docs both point to a narrow real workflow:
- install via `npx grab@latest init`
- optionally connect an agent via `npx grab@latest add <agent>` or `add mcp`
- hover/copy element context in the browser
- paste or tool-call the result into an AI workflow

That means the skill should behave like a router with a few decisive paths, not a giant all-in-one manual.

## Frequency Ranking
1. `Split in place + sync scripts/evals` — best fit for repo maintenance direction and upstream truth.
2. `Keep as-is` — simplest but clearly inferior because of stale prerequisites.
3. `Add duplicate wrapper` — structurally noisy.
4. `Merge into broader browser skills` — loses the specialized lane.

## Key Gaps
- The current front-door `SKILL.md` is too close to the 500-line ceiling.
- Setup and workflow guidance are not separated cleanly into reference docs.
- Helper scripts are out of sync with upstream Node requirements.
- Current evals do not explicitly protect the Node-version / install-path accuracy gap.

## Contradictions
- Local helper scripts say Node.js `>=18`.
- Upstream `package.json` says Node.js `>=22` and pnpm `>=8`.

## Key Insight
The best bounded improvement is not a new frontend/browser skill. It is to keep `react-grab` as the canonical React element-context skill, shrink the main file into a fast router, move installation/workflow detail into focused references, and ratchet script/eval accuracy so the repo stops teaching an outdated prerequisite story.
