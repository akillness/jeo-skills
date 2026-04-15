# Context: vibe-kanban modernization

## Workflow Context
`vibe-kanban` sits in a real and growing workflow slot: teams need a control plane for AI-agent work, not just another prompt wrapper. In software teams that usually means an issue/card → isolated workspace/worktree → diff review → PR flow, as seen in Vibe Kanban itself, VS Code Agent Kanban, OpenAI's Jira↔GitHub Codex workflow, and GitHub's own agentic-workflow guidance. Outside software, the same coordination problem appears in PM/ops, marketing/content, and game-production work as board/task orchestration, approvals, capacity tracking, and persistent context, even when diffs and PRs are replaced by briefs, calendars, or milestone updates.

Key sources:
- Vibe Kanban upstream README and docs: https://github.com/BloopAI/vibe-kanban
- VS Code Agent Kanban: https://github.com/appsoftwareltd/vscode-agent-kanban
- OpenAI Codex Jira↔GitHub cookbook: https://developers.openai.com/cookbook/examples/codex/jira-github
- GitHub agentic workflows: https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/
- Taskade project-management / marketing / game agents: https://www.taskade.com/agents/project-management , https://www.taskade.com/agents/marketing , https://www.taskade.com/agents/programming/game-development-workflow-enhancing
- KaibanJS: https://www.kaibanjs.com/kanban-for-ai

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo dev / indie builder | Run multiple agent attempts safely, review diffs, keep branches/worktrees under control | mixed |
| Web/fullstack team lead | Coordinate parallel feature work, previews, review loops, and PR handoff | intermediate–advanced |
| PM / ops lead | Track work state, approvals, and audit trail while AI helps break down or execute tasks | mixed |
| Marketing / content operator | Coordinate briefs, copy, calendars, and campaign tasks across AI + human workflows | mixed |
| Game producer / indie studio lead | Organize pitch, milestone, planning, and implementation work across a lightweight board | mixed |

## Current Workarounds
1. Existing trackers plus automation glue: Jira/GitHub or GitHub Projects plus labels, Actions, scripts, and PR bots instead of a true board-native orchestration loop. Source: https://developers.openai.com/cookbook/examples/codex/jira-github
2. Markdown-file or checklist memory (`TASKS.md`, local plan files, IDE-local kanban markdown) to keep context stable across long agent runs. Sources: https://betterstack.com/community/guides/ai/beads-issue-tracker-ai-agents/ and https://github.com/appsoftwareltd/vscode-agent-kanban
3. Review happens in PRs even when planning happens elsewhere; human approval still anchors the workflow. Sources: https://github.blog/ai-and-ml/automate-repository-tasks-with-github-agentic-workflows/ and https://github.com/BloopAI/vibe-kanban
4. Marketing/content teams fall back to spreadsheets and shared calendars because they are easier to share than heavyweight PM tools. Sources: https://zapier.com/blog/content-calendar-template/ and https://www.smartsheet.com/9-free-marketing-calendar-templates-excel
5. Game teams often stay on Trello / HacknPlan / Codecks / sheets rather than heavyweight enterprise PM. Sources: https://hacknplan.com/ , https://www.codecks.io/ , plus indexed Reddit snippets captured in this survey run.

## Adjacent Problems
- Review ergonomics lag behind agent throughput: users want iteration-aware diffs, durable comments, and less repeated review work. Source: Vibe Kanban issues cited during research.
- Worktree and preview isolation remain painful in web/fullstack workflows when multiple agent workspaces run concurrently.
- External sync is weak: teams want board state reflected in GitHub, Jira, or other systems without polling glue.
- Local-first vs cloud/team tension is unresolved: solo users want lightweight local control, while teams want shared orchestration.
- Outside software, the same orchestration pattern appears without Git/PR primitives, so route-outs matter; many requests are really PM, marketing, or game-production coordination instead of coding-board setup.

## User Voices
- “I just use it myself on one machine… I just want to have a local db with projects and issues to work from… It seems overkill.” — Vibe Kanban user asking for a lighter local-first flow. Source: https://github.com/BloopAI/vibe-kanban/issues/3354
- “when you hit start dev server on vk, it automatically stops the other server” and “Three days of usage means i have 10+ different named vk/branches and i have to hunt down which ones are right.” — Web/fullstack preview/worktree cleanup pain. Source: https://github.com/BloopAI/vibe-kanban/issues/2907
- “Looking at all the changes again that I have already reviewed before does not really make sense.” — Reviewers want iteration-aware review, not only branch-vs-main diffs. Source: https://github.com/BloopAI/vibe-kanban/issues/2086
- “Being able to comment on line numbers in the diff and have the agent respond in context makes a huge difference.” — Review-loop quality is central to product value. Source: https://github.com/BloopAI/vibe-kanban/issues/2560
- Zapier's content-calendar guidance still recommends spreadsheets because they are simpler to share than heavier PM tools. Source: https://zapier.com/blog/content-calendar-template/
