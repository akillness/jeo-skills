# Context: Vercel Skills Scope

## Workflow Context
Vercel's `skills` CLI installs reusable `SKILL.md` packages from GitHub shorthand, full Git URLs, direct paths inside repos, GitLab/other Git URLs, and local folders. The main operational decision is scope: project install for team-shared repo behavior, or global install with `-g` for personal agent defaults.

The Vercel docs list installable skill categories such as AI SDK, Design/UI, Browser automation, Deployment, Workflow, and Utility. The `find-skills` skill and `npx skills find <query>` are the official discovery path.

Provenance: direct page retrieval — https://vercel.com/docs/agent-resources/skills, https://vercel.com/changelog/introducing-skills-the-open-agent-skills-ecosystem, https://github.com/vercel-labs/skills/blob/main/README.md

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Repo maintainer | Keep `.agent-skills/`, README, setup prompt, and manifest aligned | Advanced |
| Claude Code user | Install Claude-native or Claude-compatible skills globally or per project | Intermediate |
| Codex/Gemini/OpenCode user | Install the same skills into the agent-specific global path or portable project path | Intermediate |
| Team contributor | Pull project-local skills from the repo and trust/review them before use | Intermediate |

## Current Workarounds
1. Manually copy `SKILL.md` folders into `~/.claude/skills/` or `~/.codex/skills/`.
2. Use this repo's legacy `.agent-skills` installer, then separately link/copy to agent-native paths.
3. Paste skill content into the chat when the target agent does not auto-load the skill.
4. Put essential triggers in `AGENTS.md`/`CLAUDE.md` because skill auto-triggering can be unreliable.

## Adjacent Problems
- Agent-specific path drift: Claude Code uses `.claude/skills`, Codex project installs often use `.agents/skills`, and OpenCode uses its own global config directory.
- Scope confusion: global installs do not get committed; project installs do.
- Skill trigger reliability: Vercel's eval writeup found skills work better when `AGENTS.md` explicitly tells agents when to load them.
- Security: skills can include scripts, so review-before-install and known sources matter.

## User Voices
- "Install a skill package with `npx skills add <package>`." — Vercel changelog, direct page retrieval.
- "Project scope ... shared with your team; Global scope ... available across all projects." — Vercel KB, direct page retrieval.
- "`AGENTS.md` docs index achieved 100% while skills with explicit instructions reached 79%." — Vercel eval writeup, direct page retrieval.
