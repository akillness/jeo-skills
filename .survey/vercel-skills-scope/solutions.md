# Solution Landscape: Vercel Skills Scope

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Vercel `skills` CLI | `npx skills add <source>` with `-g`, `-a`, `--skill`, `--copy`, `--all` | Official ecosystem, multi-agent support, Git/local sources | Path behavior differs by agent; trigger reliability still depends on agent behavior | direct page retrieval |
| Project-local skills | Install into repo-local `.claude/skills/` or `.agents/skills/` | Reviewable, team-shared, versioned | Requires project trust and may be ignored by some agents until trusted | direct page retrieval |
| Global agent skills | Install into `~/.claude/skills/`, `~/.codex/skills/`, etc. | Personal default across projects | Not committed; can drift across machines | direct page retrieval |
| AGENTS.md/CLAUDE.md trigger hints | Keep compact pointers and instructions in always-loaded context | Improves skill invocation reliability | Adds context overhead; must avoid stale pointers | direct page retrieval |

## Categories
- Installer: Vercel `skills` CLI and skills.sh directory.
- Scope: project default vs global `-g`.
- Targeting: `-a claude-code`, `-a codex`, `-a gemini-cli`, `-a opencode`, or `-a '*'`.
- Distribution: GitHub repo, direct repo subpath, local folder, copied or symlinked install.

## What People Actually Use
For public skills, the most common path is `npx skills add owner/repo` or `npx skills add -g owner/repo --skill name -y`. For maintained repos, project-local skill folders and `skills-lock.json`/setup prompts are used to make the same skill set reproducible.

## Frequency Ranking
1. `npx skills add <owner/repo>` for quick installs.
2. `npx skills add -g <owner/repo> --skill <name>` for personal global installs.
3. Project-local `.agents/skills/` or `.claude/skills/` for repo-specific behavior.
4. `AGENTS.md`/`CLAUDE.md` hints to force retrieval when the agent might not invoke a skill.

## Key Gaps
- The Vercel CLI docs describe agent paths, but OS-specific shell syntax still needs local documentation.
- Not every agent treats project-local skill trust and slash-command exposure the same way.
- Some discovery surfaces in this repo are generated or semi-generated, so adding a skill requires catalog sync.

## Contradictions
- Skills reduce context until needed, but Vercel's own evals show always-loaded `AGENTS.md` pointers can outperform relying on skill auto-triggering alone.
- Global installs are convenient, but project installs are the better default when teams need deterministic behavior.

## Key Insight
Use Vercel `skills` CLI as the install transport, but keep critical activation guidance in README/setup/AGENTS surfaces. For `oh-my-skills`, adding `deepinit` and `deep-dive` must update the real folder tree plus catalog surfaces so both `skills add --skill ...` and agent discovery can find them.
