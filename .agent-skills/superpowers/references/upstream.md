# Upstream Provenance: `obra/superpowers`

- **Repository**: <https://github.com/obra/superpowers>
- **Pinned Commit**: `22f0b463e7a5e579904dd6211a520321035526f7` (`2026-11-03`)
- **License**: `MIT`
- **Version (`plugin.json` / `package.json`)**: `5.0.7`

## Built-in 14 Skills (`skills/`)

1. `brainstorming` — Socratic requirement refinement & design sign-off before coding
2. `using-git-worktrees` — isolated branch worktrees & clean test baseline verification
3. `writing-plans` — 2-5 minute verifiable micro-task execution plans
4. `subagent-driven-development` — per-task subagent execution with two-stage review
5. `executing-plans` — batch execution with human checkpoints
6. `dispatching-parallel-agents` — parallel investigation for independent failures
7. `test-driven-development` — strict RED-GREEN-REFACTOR loop
8. `systematic-debugging` — 4-phase root-cause analysis & defense-in-depth
9. `requesting-code-review` — structured review checklists against spec & diff
10. `receiving-code-review` — technical verification of review feedback before edits
11. `verification-before-completion` — fresh verification evidence required before claiming done
12. `finishing-a-development-branch` — merge/PR/cleanup options after green checks
13. `using-superpowers` — session-start skill routing discipline
14. `writing-skills` — TDD-style skill authoring and pressure testing

## Multi-Host Installation

- Claude Code: `/plugin install superpowers@claude-plugins-official` or `/plugin marketplace add obra/superpowers-marketplace`
- Gemini CLI: `gemini extensions install https://github.com/obra/superpowers`
- Cursor: `/add-plugin superpowers`
- Codex / OpenCode: follow `.codex/INSTALL.md` / `.opencode/INSTALL.md` in upstream repo

## Cross-Routing

- Role-based CEO/Design/QA browser sprints -> `gstack`
- Spec-Kit artifact CLI -> `spec-kit`
- AWS AI-DLC gated workflows -> `aidlc-workflows`
