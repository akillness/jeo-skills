# Solution Landscape: vibe-kanban modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Vibe Kanban | Board-first coding-agent orchestration with workspaces, worktrees, diff review, PR flow | Closest match to the skill's core subject; strong board metaphor and review loop | Current product surface still shows friction around auto-refresh, cleanup, review ergonomics, and integration complexity | Primary benchmark and upstream source: https://github.com/BloopAI/vibe-kanban |
| GitHub Copilot cloud agent | GitHub-native async coding agent that researches, changes code, and opens PRs | Tightest PR/review integration and clear repo-native workflow | Limited scope per run; GitHub-hosted assumptions; one-PR-per-task model | Good comparator for repo-native review/approval framing: https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-cloud-agent |
| OpenHands | Open-source coding-agent platform plus GitHub issue/PR workflows | Strong examples of issue/comment/PR automation and review bots | Heavier setup, more secrets/actions/config, less board-first than Vibe Kanban | Good evidence for human review + workflow automation: https://github.com/All-Hands-AI/OpenHands |
| Taskmaster AI | Task decomposition / planning layer for AI coding | Strong planning and dependency structure for multi-step work | Not a true kanban board; config/API-key complexity; weaker review-board story | Useful planning comparator: https://github.com/eyaltoledano/claude-task-master |
| LangGraph | Durable, stateful human-in-the-loop agent workflows | Strong orchestration concepts: persistence, retries, controlled state transitions | Framework-level, not ready-made board UX | Useful for abstraction/rules/hooks thinking: https://github.com/langchain-ai/langgraph |
| AutoGen / AutoGen Studio | Multi-agent framework with visual prototyping UI | Shows how visual workflow composition can help multi-agent systems | Studio is not production-ready; not a strong Git/worktree/PR board | Secondary inspiration, not direct operator benchmark: https://github.com/microsoft/autogen |
| Taskade / KaibanJS | General-purpose AI-agent workflow boards across business use cases | Broad proof that board-style AI orchestration extends beyond coding | Usually weaker on Git/worktree/review specifics | Important for route-outs to PM/ops/marketing/game workflows: https://www.taskade.com/vibe-workflows and https://www.kaibanjs.com/kanban-for-ai |

## Categories
- Board-first coding-agent orchestration: Vibe Kanban
- GitHub-native async coding / PR agents: GitHub Copilot cloud agent, OpenHands GitHub workflows
- Task decomposition / planning layer: Taskmaster AI
- Durable orchestration frameworks: LangGraph, AutoGen, MetaGPT-class tooling
- General AI workflow boards: Taskade, KaibanJS

## What People Actually Use
In practice, teams still anchor orchestration in existing systems of record: Jira, GitHub, PR review, Markdown task files, spreadsheets, and lightweight kanban tools. The evidence suggests `vibe-kanban` is most valuable when it clearly owns the board/workspace/review/worktree loop for coding-agent tasks while explicitly routing PM-only, marketing-only, and non-code game-production workflows to other tools or skills.

## Frequency Ranking
1. Git/PR review remains the center of serious coding-agent workflows.
2. Setup/integration complexity is a recurring friction point across almost every solution.
3. Visual board UX is still comparatively rare; most alternatives are either frameworks or GitHub-native bots.
4. Human review loops are mandatory, not optional.
5. Native parallel multi-agent coordination is still under-served even when tools support multiple agents in principle.

## Key Gaps
- Few solutions combine board-native task management, isolated workspaces, clean review ergonomics, and clear route-outs.
- Many alternatives either do planning well but not board control, or PR automation well but not multi-workspace operator UX.
- Non-code teams use similar orchestration patterns but lack the Git/worktree assumptions, so a skill needs explicit boundary language.
- The current `vibe-kanban` skill lacks an eval harness despite being high-visibility and workflow-heavy.

## Contradictions
- Marketed promise: "multi-agent collaboration" sounds automatic. User reality: humans still review diffs, manage cleanup, and patch integration gaps.
- Marketed promise: board-as-control-plane. User reality: many teams still live in Jira, GitHub, Linear, spreadsheets, or chat and only partially adopt AI-native boards.
- Marketed promise: one orchestration surface for everything. User reality: software review loops and non-code coordination loops differ enough that route-outs are necessary.

## Key Insight
The best bounded improvement is not adding another orchestration skill. It is modernizing `vibe-kanban` into a decision-first board/workspace/review anchor that explains when to use a coding-agent kanban board, when to stay in existing trackers, how to manage human review and worktree hygiene, and when to route a request to PM/marketing/game-production workflow skills instead.
