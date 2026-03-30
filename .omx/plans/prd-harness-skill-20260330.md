# PRD — Harness Skill Addition

## Goal

Add a new `harness` skill to `oh-my-skills` based on `revfactory/harness`, adapted for Claude Code, Codex CLI, Gemini CLI / Antigravity, OpenCode, Pi, Claw, and similar agent platforms.

## Why

- The repo already documents Harness as an external OSS option, but does not ship an installable skill.
- Users currently have to read `docs/harness` and upstream GitHub docs manually.
- A first-class skill should let users trigger Harness-style team/skill scaffolding directly from `oh-my-skills`.

## User Stories

- As a user, I can say `build a harness for this project` and get a harness-oriented skill activated.
- As a user, I can understand how Harness concepts map across Claude, Codex, Gemini, OpenCode, Pi, and Claw style environments.
- As a maintainer, I can refresh bundled upstream references without manually copy-pasting from GitHub.

## Scope

- Add `.agent-skills/harness/SKILL.md`
- Add bundled `references/`
- Add a maintenance `scripts/` helper
- Update `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`
- Update `.agent-skills/skills.json`

## Non-Goals

- Do not implement the upstream Harness plugin itself inside this repo
- Do not add platform-specific executable plugins for Claude/Codex/Gemini
- Do not modify unrelated skills

## Acceptance Criteria

1. `harness` skill directory exists with valid frontmatter and clear trigger description.
2. Skill instructions explain upstream Harness workflow and how to adapt it cross-platform.
3. Bundled references and a refresh script exist.
4. `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` mention the new skill.
5. `.agent-skills/skills.json` includes the new skill and updated counts.
6. Repo verification passes for the touched surfaces.
