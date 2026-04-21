# Context: react-grab structural hardening

## Workflow Context
This run started with a cross-domain repo-local opportunity scan across the required lanes:

| Lane | Sample anchors reviewed | Repo-local signal | Outcome |
|------|--------------------------|-------------------|---------|
| CLI / developer workflow | `git-workflow`, `opencontext`, `fabric` | 271–309 lines, recent hardening, multi-reference support already in place | Healthy enough; no bounded win bigger than web lane |
| Web / frontend | `react-grab`, `design-system`, `react-best-practices` | `react-grab` at 494 lines with only 1 reference file and stale helper-script requirements; `design-system` also large but less obviously stale; `react-best-practices` refreshed today | **Best candidate** |
| PM / ops | `task-planning`, `standup-meeting`, `sprint-retrospective` | Stable 233–305 lines, already modernized with evals/support | Defer |
| Marketing / GTM | `marketing-automation`, `marketing-skills-collection` | Fresh alias hardening landed today | Defer |
| Game development | `bmad-gds`, `game-performance-profiler`, `steam-store-launch-ops` | Healthy support coverage; no obvious stale helper mismatch surfaced | Defer |

The web lane stood out because `react-grab` is both:
1. close to the 500-line soft cap for `SKILL.md`, and
2. out of sync with upstream install/runtime expectations.

Primary repo-local evidence:
- `.agent-skills/react-grab/SKILL.md` is 494 lines and mixes quick-start, installation matrix, usage modes, API surface, plugin hooks, troubleshooting, agent integrations, and removal.
- `.agent-skills/react-grab/references/` currently contains only `api.md`, so the front-door file still carries too much setup and workflow detail.
- `.agent-skills/react-grab/scripts/install.sh` and `scripts/add-agent.sh` still say Node.js `>=18`.
- `graphify-out/GRAPH_REPORT.md` says the repo is now support-complete, so the best next maintenance direction is high-degree / high-visibility anchor quality rather than missing folders.

Primary-source evidence from upstream:
- GitHub raw primary-source retrieval: `https://raw.githubusercontent.com/aidenybai/react-grab/main/README.md`
  - Positions `react-grab` around fast element-context capture, `npx grab@latest init`, and `npx grab@latest add mcp`.
- GitHub raw primary-source retrieval: `https://raw.githubusercontent.com/aidenybai/react-grab/main/package.json`
  - Declares `"node": ">=22"` and `"pnpm": ">=8"`, which conflicts with this repo’s helper scripts.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Frontend engineer using AI coding agents | Install `react-grab`, capture element context, hand exact component/file data to agent | Intermediate |
| Repo maintainer | Keep skill guidance accurate, bounded, and easy to validate | Advanced |
| Agent using the skill | Route quickly between clipboard use, MCP integration, and deeper plugin/API work | Intermediate |

## Current Workarounds
1. Read the oversized `SKILL.md` front-to-back to find the right install path.
   - Limitation: too much front-door detail for a skill that should route quickly.
2. Use `references/api.md` for API detail while still relying on the main file for setup and agent-integration guidance.
   - Limitation: support split is incomplete.
3. Trust helper scripts for prerequisites.
   - Limitation: current scripts understate upstream Node requirements.

## Adjacent Problems
- Boundary blur with broader browser/frontend tooling (`agent-browser`, `agentation`, `design-system`, `react-best-practices`) if `react-grab` over-explains everything instead of staying on its precise element-context lane.
- Weak onboarding if helper scripts disagree with upstream runtime requirements.
- Future maintenance drift if reference materials remain concentrated in a single API file.

## User Voices
> "Point at any element and press **⌘C** (Mac) or **Ctrl+C** (Windows/Linux) to copy the file name, React component, and HTML source code."  
Source: GitHub raw primary-source retrieval — `https://raw.githubusercontent.com/aidenybai/react-grab/main/README.md`

> `"node": ">=22"`  
Source: GitHub raw primary-source retrieval — `https://raw.githubusercontent.com/aidenybai/react-grab/main/package.json`
