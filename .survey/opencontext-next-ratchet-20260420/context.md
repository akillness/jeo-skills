# Context: opencontext next ratchet

## Workflow Context
Active project memory appears whenever an agent must continue real work across prompts, sessions, branches, or tools. The strongest adjacent evidence is that major coding-agent workflows still rely on explicit repo-visible memory surfaces: Claude Code uses `CLAUDE.md` for persistent project instructions and memory ([Anthropic docs](https://docs.anthropic.com/en/docs/claude-code/memory)); Cursor keeps repo guidance in Rules/Memories ([Cursor docs](https://docs.cursor.com/context/rules-for-ai)); Cline formalizes a markdown `Memory Bank` for `projectbrief`, `activeContext`, and progress artifacts ([Cline docs](https://docs.cline.bot/prompting/cline-memory-bank)).

A second recurring pattern is structure compression when plain repo inspection is not enough. Aider sends a repository map with each change request so the model keeps codebase orientation ([Aider repo map](https://aider.chat/docs/repomap.html)); repo packers like Repomix package repositories into a single AI-friendly artifact for one-shot context transfer ([Repomix](https://github.com/yamadashy/repomix)). Those tools reduce cold-start pain, but they do not solve active, evolving project memory on their own.

The highest-value gap for `opencontext` is therefore not “another memory layer explainer.” It is a trustworthy active-memory brief that helps agents answer four operational questions quickly:
1. What should I load first?
2. Which existing note should I trust when repo docs disagree?
3. Is this memory still fresh for the current branch/task?
4. What compact note should I leave behind after meaningful work?

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer / tech lead | Define repo conventions, boundaries, and handoff notes for recurring agent work | Advanced |
| Coding-agent operator | Load the right context before coding/review/release tasks and store conclusions after runs | Intermediate–Advanced |
| Occasional contributor | Recover repo-specific norms and active constraints without tribal knowledge | Intermediate |
| Reviewer / incident responder | Retrieve prior decisions, pitfalls, and current-risk notes during debugging/release work | Intermediate–Advanced |
| Multi-agent workflow owner | Pass compact, scoped project memory across planning, coding, QA, and release agents | Advanced |

## Current Workarounds
1. **Repo-local instruction files** such as `CLAUDE.md`, `AGENTS.md`, README sections, or local rules files. They are easy to start but drift and rarely explain precedence when multiple files disagree. Sources: [Anthropic docs](https://docs.anthropic.com/en/docs/claude-code/memory), [Cursor docs](https://docs.cursor.com/context/rules-for-ai).
2. **Manual handoff docs** like `handoff.md`, `STATUS.md`, or project TODO notes. These survive session boundaries but become another maintenance surface.
3. **Repo maps and one-shot packers** like Aider repo map and Repomix. They help orientation or transfer, but they do not answer which active note owns the current task or how to store the next conclusion. Sources: [Aider repo map](https://aider.chat/docs/repomap.html), [Repomix](https://github.com/yamadashy/repomix).
4. **External wiki/vault layers** (Notion, Obsidian, markdown wikis) that humans maintain, then distill back into repo-visible notes for agent execution. Helpful for long-lived synthesis, weak as the minimal active-memory packet.
5. **Opaque agent-memory systems** that persist facts over time but often hide provenance, repo-locality, or trust rules. Example adjacent category: [Mem0](https://github.com/mem0ai/mem0).

## Adjacent Problems
- **Freshness / staleness:** project memory can go stale faster than architecture docs when migrations, release branches, or active incidents change the “current truth.”
- **Precedence conflicts:** README, `CLAUDE.md`, operator notes, and retrieved handoff docs can disagree; users still need a trust order.
- **Provenance:** operators need to know whether a memory came from canonical docs, a human-authored note, a previous agent summary, or inferred heuristics.
- **Branch awareness:** a useful active-memory layer should warn when a stored note may belong to another branch or outdated repo state.
- **Scope discipline:** active project memory is not the same as a long-lived wiki, a graph layer, a vault, or a one-shot repo packer.

## User Voices
- “Store project-specific instructions and memory in `CLAUDE.md`.” — a clear signal that users want repo-scoped persistence, not repeated background prompts. Source: [Anthropic docs](https://docs.anthropic.com/en/docs/claude-code/memory)
- Cursor’s repo Rules/Memories model expresses the same operator need: there are facts the assistant should always know in this repository, but users still have to curate them. Source: [Cursor docs](https://docs.cursor.com/context/rules-for-ai)
- Cline’s `Memory Bank` makes the workaround explicit: teams split active context, progress, and brief files because session memory alone is not enough. Source: [Cline docs](https://docs.cline.bot/prompting/cline-memory-bank)
- Repo packers and repo maps exist because users still experience “the model does better when I hand it a compact repo summary instead of rediscovering structure every time.” Sources: [Aider repo map](https://aider.chat/docs/repomap.html), [Repomix](https://github.com/yamadashy/repomix)

### Confidence note
High for the workflow pattern itself: the same repo-local-memory workaround appears across Claude Code, Cursor, Cline, Aider, and repo-packer tooling. Medium for broader “agent memory” comparison claims where adjacent products differ in implementation details.