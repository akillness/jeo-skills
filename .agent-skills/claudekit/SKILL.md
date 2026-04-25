---
name: claudekit
description: >
  Use this skill when you need a standardized Claude Code workflow toolkit.
  It covers claudekit plugin installation, init-wizard scaffolding for rules/modes/hooks/MCP,
  and safe operating guidance for team adoption.
allowed-tools: Read Write Bash Grep Glob WebFetch
metadata:
  tags: claude-code, workflow, plugin, skills, agents, mcp, hooks
  platforms: Claude Code
  keyword: claudekit
  version: latest
  source: duthaho/claudekit
  license: MIT
---

# claudekit — Claude Code workflow toolkit

`claudekit` is an opinionated Claude Code plugin that bundles reusable skills/agents and an interactive setup wizard.

## When to use this skill
- You want project-level **rules/modes/hooks/MCP** scaffolding quickly.
- You need repeatable Claude Code workflows across teammates.
- You want a curated starter set of planning/review/build skills.

## Instructions
1. Add marketplace and install plugin:
   ```bash
   /plugin marketplace add duthaho/claudekit-marketplace
   /plugin install claudekit
   ```
2. Run setup wizard:
   ```bash
   /claudekit:init
   # or full setup
   /claudekit:init --all
   ```
3. Verify generated files exist:
   - `.claude/rules/`
   - `.claude/modes/`
   - `.claude/hooks/` + `settings.local.json`
   - `.mcp.json`
4. Review generated defaults before commit; keep project-specific policies explicit.

## Examples
- New repo bootstrap: `/claudekit:init --all` 후 초기 workflow 패키지 생성.
- Existing repo hardening: `hooks`/`rules` 일부만 선택 설치해 점진 도입.

## Best practices
- Generated hook/rule를 그대로 신뢰하지 말고 팀 정책과 충돌 여부를 먼저 검토.
- 스킬/플러그인 업데이트는 릴리즈 노트 확인 후 반영.
- claudekit은 가속기이며, 저장소별 검증 게이트(test/lint/review)를 대체하지 않는다.

## References
- Repository: https://github.com/duthaho/claudekit
- Marketplace: https://github.com/duthaho/claudekit-marketplace
- Evidence snapshot (hourly survey run): stars=87, pushedAt=2026-04-24, license=MIT
