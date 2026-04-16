# Context: JEO structural hardening

## Workflow Context
`jeo` is the public orchestration front door for this repository: README and README.ko present it as the default cross-platform entrypoint, and `setup-all-skills-prompt.md` treats it as the first command to start work. The current `SKILL.md` does four jobs at once: it routes users through PLAN → EXECUTE → VERIFY → CLEANUP, embeds repo-local `.jeo/` ledger behavior, documents per-platform hook/config snippets, and carries a state-schema / troubleshooting appendix. That breadth is useful, but it makes the top-level trigger surface harder to scan and maintain.

Primary repo evidence:
- `README.md` lines around the quickstart and architecture graph: `https://github.com/akillness/oh-my-skills/blob/main/README.md`
- `README.ko.md` lines around the same JEO entrypoints: `https://github.com/akillness/oh-my-skills/blob/main/README.ko.md`
- `setup-all-skills-prompt.md` JEO install/setup sections: `https://github.com/akillness/oh-my-skills/blob/main/setup-all-skills-prompt.md`
- `.agent-skills/jeo/SKILL.md`: `https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/jeo/SKILL.md`
- `.agent-skills/jeo/references/FLOW.md` and `references/DOT_JEO_LEDGER.md`
- `.agent-skills-wiki/concepts/core-orchestration-platform-cluster.md`
- `graphify-out/GRAPH_REPORT.md`

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Cross-platform operator | Start a project with one command, keep planning/QA gates honest, and resume work across sessions | Intermediate–advanced |
| Repo maintainer | Keep the highest-visibility orchestration skill accurate across four runtimes and multiple docs surfaces | Advanced |
| Platform-specific user | Understand whether a question belongs to `jeo`, `ralph`, `plannotator`, `agent-browser`, `agentation`, `omc`, `omx`, or `ohmg` | Intermediate |

## Current Workarounds
1. Keep a giant all-in-one `SKILL.md` and accept slower maintenance when platform config, state fields, or troubleshooting details change.
2. Rely on `references/FLOW.md` and `references/DOT_JEO_LEDGER.md` for deeper context, but still duplicate enough detail in `SKILL.md` that the file remains over the recommended limit.
3. Use top-level docs (`README*`, setup prompt, `skills.toon`) as the user-facing summary, while leaving internal routing detail inside `SKILL.md`; this works until the summary and the operational detail drift.
4. Use neighboring orchestration skills (`ralph`, `plannotator`, `agent-browser`, `agentation`, `omc`, `omx`, `ohmg`, `ralphmode`) to explain parts of the flow, but without a crisp route-out table `jeo` can start to look like it owns their internals.

## Adjacent Problems
- `jeo` is the discovery anchor for the repo, so wording mistakes propagate into README, setup prompts, and compact discovery artifacts.
- Cross-platform hook/config snippets age faster than the core PLAN/EXECUTE/VERIFY loop.
- State-schema and troubleshooting sections are reference material, not first-pass trigger material, but they compete for attention in the main file.
- The orchestration lane already has many neighboring skills, so weak boundary language causes duplicate-pressure even when the catalog itself is otherwise clean.

## User Voices
> "Agent Skills is a curated collection of 89 AI agent skills for LLM-based development workflows. Built around the `jeo` orchestration protocol..." — `README.md`

> "Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` on Claude Code. Creates a `.jeo/` ledger... for durable workflow state." — `setup-all-skills-prompt.md`

> "`jeo` = higher-level integrated orchestration that can compose platform skills, but should not flatten their boundaries" — `.agent-skills-wiki/concepts/core-orchestration-platform-cluster.md`

Confidence notes:
- High: all claims above come from repo-local primary sources read in this run.
- Medium: no external indexed search was used because `web_search` returned `401 Invalid API key` in this environment, so this survey intentionally prioritizes repo-local maintenance evidence over broader market validation.
