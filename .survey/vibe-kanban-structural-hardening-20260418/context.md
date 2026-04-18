# Context: vibe-kanban structural hardening

## Workflow Context
AI coding boards show up when teams move past one-off prompts into a repeatable loop of bounded coding cards, isolated workspaces or worktrees, review queues, retries, and PR handoff. The strongest internal repo signal is that `vibe-kanban` remains one of the highest-degree orchestration nodes in `graphify-out/GRAPH_REPORT.md`, which means many adjacent discovery surfaces and route-outs still depend on it being clear. External evidence points the same way: Git documents `git-worktree` as the clean isolation primitive, Anthropic's Claude Code docs describe common workflows that include worktree-centered task execution, GitHub positions Projects as a planning/tracking surface, GitHub merge queue focuses on PR integration velocity, and the upstream `BloopAI/vibe-kanban` repo explicitly sells itself as a way to get more from coding agents.

Primary-source retrieval notes used in this run:
- `https://git-scm.com/docs/git-worktree` → title recovered as `Git - git-worktree Documentation`
- `https://docs.anthropic.com/en/docs/claude-code/common-workflows` → title `Common workflows - Claude Code Docs`
- `https://docs.github.com/.../about-projects` → title `About Projects - GitHub Docs`, description `Projects is an adaptable, flexible tool for planning and tracking work on GitHub.`
- `https://docs.github.com/.../managing-a-merge-queue` → title `Managing a merge queue - GitHub Docs`, description `You can increase development velocity with a merge queue for pull requests in your repository.`
- `https://github.com/BloopAI/vibe-kanban` → title `GitHub - BloopAI/vibe-kanban: Get 10X more out of Claude Code, Codex or any coding agent`

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo AI-heavy developer | Split work into safe parallel coding cards and keep workspace state understandable | Intermediate to advanced |
| Tech lead / staff engineer | Keep multi-agent work reviewable, mergeable, and bounded | Advanced |
| Product-minded engineering manager | Translate issue-board demand into coding-board execution without losing PR hygiene | Intermediate |
| Fullstack delivery team | Run frontend/backend/test/docs tasks in parallel without branch collisions | Intermediate to advanced |
| Game tools or gameplay engineer | Use coding-task boards for engine/tooling tasks while routing non-code milestone work elsewhere | Intermediate to advanced |

## Current Workarounds
1. Use GitHub Projects, Linear, Jira, or Trello as the visible board, then manually run coding agents from each ticket.
2. Pair git worktrees with tmux tabs or shell scripts and treat those as the real control plane.
3. Open one PR per agent/task and let review queues become the de facto board.
4. Keep retry notes in chat or scratch docs instead of on the card or in the workspace record.
5. Route non-code planning, marketing, and game-production work through generic boards even when they do not need coding workspaces at all.

## Adjacent Problems
- Review saturation grows faster than raw code generation.
- Branch/worktree cleanup becomes invisible debt.
- Tracker state, local workspace state, and PR state drift apart.
- Dedicated board tools are still immature compared with generic tracker + Git combinations.
- Non-code board requests can accidentally trigger coding-board skills unless route-outs stay explicit.

## User Voices
> "Get 10X more out of Claude Code, Codex or any coding agent." — upstream `BloopAI/vibe-kanban` repository title, emphasizing coding-agent leverage rather than general PM boards. Source: https://github.com/BloopAI/vibe-kanban

> "Projects is an adaptable, flexible tool for planning and tracking work on GitHub." — GitHub Docs, showing why many teams still default to general trackers instead of AI-native board tools. Source: https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/about-projects

> "You can increase development velocity with a merge queue for pull requests in your repository." — GitHub Docs, highlighting that integration and review flow remain central even when execution is parallelized. Source: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
