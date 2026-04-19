# Context: opencontext structural hardening

## Workflow Context
`opencontext` fits the active project/repo memory layer: load context before work, search during work, and store conclusions after meaningful work. That shows up in CLI/dev workflows where sessions restart cold, in fullstack repos where static instruction files cannot carry changing project state, in PM/ops handoffs where ADRs and runbooks need an indexable operational layer, in marketing/content workflows where campaign memory sits beside evergreen style guides, and in game-dev production where current sprint decisions sit beside a larger GDD/wiki.

Sources:
- OpenContext README — https://github.com/0xranx/OpenContext/blob/main/README.md
- OpenContext usage docs — https://0xranx.github.io/OpenContext/en/usage/
- Claude Code memory docs — https://docs.anthropic.com/en/docs/claude-code/memory
- GitHub Copilot custom instructions — https://docs.github.com/en/copilot/customizing-copilot/adding-custom-instructions-for-github-copilot
- ADR README — https://github.com/joelparkerhenderson/architecture-decision-record/blob/main/README.md
- Ops runbooks README — https://github.com/justin-henson/ops-runbooks/blob/main/README.md
- Mailchimp content style guide — https://github.com/mailchimp/content-style-guide/blob/master/00-index.html.md
- GDD markdown template — https://github.com/LazyHatGuy/GDDMarkdownTemplate/blob/master/README.md

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| CLI-first developer / agent operator | Keep repo context reusable across sessions and tools | Intermediate–advanced |
| Fullstack engineer / tech lead | Preserve current API/frontend/test/review decisions | Intermediate–advanced |
| PM / ops owner | Hand off runbooks, decision logs, acceptance criteria, and status packets | Intermediate |
| Marketing / content operator | Keep active campaign memory separate from evergreen style guidance | Intermediate |
| Game producer / cross-discipline lead | Preserve current production-state context beside the larger GDD/wiki | Intermediate |

## Current Workarounds
1. Static instruction files such as `CLAUDE.md`, `.clinerules`, `AGENTS.md`, or repo/org Copilot instructions. Limitation: strong for rules, weaker for current state and handoff notes.  
2. ADRs, runbooks, and postmortems. Limitation: durable but not always the smallest “read this first” packet for the next agent.  
3. Wiki or vault tools such as Obsidian/Notion/Dendron. Limitation: better for narrative knowledge bases than active repo-memory loops.  
4. Repo-digest tools such as Repomix, Gitingest, or Code2Prompt. Limitation: useful for one-shot context loading, weak for persistent decisions and post-task storage.  
5. Manual fresh-chat summaries and markdown handoff docs. Limitation: low-friction, but ad hoc and easy to drift.

## Adjacent Problems
- Fresh-session amnesia in agent tools; some sessions always restart with a new context window.
- Instruction fragmentation when repo/org/global guidance piles up with unclear precedence.
- Long-context compaction or fidelity loss in large memory files.
- Cross-machine / container drift where learned context disappears.
- Tool sprawl: teams bolt together repo rules, wiki pages, packers, and handoff docs because no single layer is clearly scoped.

## User Voices
- “When you use an AI assistant to build things, context gets lost (across days, repos, chats).” — OpenContext README: https://github.com/0xranx/OpenContext/blob/main/README.md
- “Each Claude Code session begins with a fresh context window.” — Claude Code memory docs: https://docs.anthropic.com/en/docs/claude-code/memory
- “Long `CLAUDE.md` files lose fidelity after compaction... causing the model to forget project conventions, coding styles, or workflow rules.” — anthropics/claude-code issue #44166: https://github.com/anthropics/claude-code/issues/44166
- “Claude cannot prepare for compaction... [it] needs to write critical state to handoff files before context is compressed.” — anthropics/claude-code issue #33026: https://github.com/anthropics/claude-code/issues/33026
- Ask HN users report using “final clean code” + “complete detailed summary” as a crude handoff between chats. — HN Algolia mirror for item 43922759: https://hn.algolia.com/api/v1/items/43922759
