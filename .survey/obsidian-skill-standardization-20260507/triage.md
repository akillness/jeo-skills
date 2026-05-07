# Triage

- run_at: 2026-05-07
- repo: https://github.com/akillness/oh-my-skills
- scope_policy: newly added skills in last 3 days first
- candidate_chosen: `.agent-skills/obsidian`
- why_this_candidate: validator showed 1 warning (missing `## Examples`) while other newly added skills were clean.

## Reviewed new skills (3-day window)

Source command:

```bash
git log --since='3 days ago' --diff-filter=A --name-only --pretty=format: \
  | grep '^\.agent-skills/.*/SKILL\.md$' | sort -u
```

Reviewed list:
- .agent-skills/agentic-skills/SKILL.md
- .agent-skills/browser-harness/SKILL.md
- .agent-skills/caveman/SKILL.md
- .agent-skills/diagnose/SKILL.md
- .agent-skills/git-guardrails-claude-code/SKILL.md
- .agent-skills/grill-me/SKILL.md
- .agent-skills/grill-with-docs/SKILL.md
- .agent-skills/improve-codebase-architecture/SKILL.md
- .agent-skills/migrate-to-shoehorn/SKILL.md
- .agent-skills/notebooklm/SKILL.md
- .agent-skills/obsidian/SKILL.md
- .agent-skills/open-design/SKILL.md
- .agent-skills/scaffold-exercises/SKILL.md
- .agent-skills/setup-pre-commit/SKILL.md
- .agent-skills/tdd/SKILL.md
- .agent-skills/to-issues/SKILL.md
- .agent-skills/to-prd/SKILL.md
- .agent-skills/triage/SKILL.md
- .agent-skills/write-a-skill/SKILL.md
- .agent-skills/zoom-out/SKILL.md
