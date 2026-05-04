---
name: write-a-skill
description: >
  Create structured agent skills with proper documentation following the SKILL.md
  format. Three-phase process: gather requirements, draft SKILL.md and supporting
  files, review with user. Use when building new reusable agent capabilities or
  formalizing existing workflows into a shareable skill.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Universal — creates skills compatible with Claude Code, Codex, Gemini CLI, and
  other agent platforms. The description field is the most critical element as it
  is what agents see when deciding to activate a skill.
metadata:
  tags: skill-creation, agent-skills, documentation, reusability, skill-design
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# Write a Skill

Create structured agent skills with proper documentation.

## When to use this skill

- Formalizing a workflow into a reusable, shareable skill
- Building new agent capabilities from scratch
- Documenting existing patterns so agents can discover and use them

## Critical design principle

> The description field is the only thing your agent sees when deciding which skill to load.

Write descriptions that:
- Clearly state what the skill does
- Include specific triggers: "Use when [context]"
- Have a 1024-character maximum
- Are precise enough that the agent knows whether to activate

## Process

### Phase 1 — Gather requirements

Understand:
- What task or workflow does this skill formalize?
- What are the trigger conditions (when should an agent activate this)?
- What are the boundaries (what does this skill NOT do)?
- What platforms should this work on?
- Does this overlap with existing skills?

### Phase 2 — Draft the skill

Create `SKILL.md` as the core file. Keep it under 100 lines.

Split into additional files when:
- SKILL.md exceeds ~100 lines
- Content covers distinct domains users won't always need
- Examples would clutter the core instructions

Supported supporting files:
- `REFERENCE.md` — detailed reference content
- `EXAMPLES.md` — concrete examples
- `scripts/` — deterministic utility scripts

### Phase 3 — Review with user

Present the draft. Validate:
- Description accurately triggers on the right requests?
- Instructions are clear and complete?
- Boundaries prevent misuse?
- Supporting files are needed or is SKILL.md sufficient?

## SKILL.md template (oh-my-skills format)

```yaml
---
name: skill-name
description: >
  One-paragraph description of what this skill does and when to use it.
  Include trigger conditions: "Use when [specific context]."
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Platform and context compatibility notes. What it pairs with.
metadata:
  tags: tag1, tag2, tag3, tag4
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: your-github/repo
---

# Skill Name

Brief intro paragraph.

## When to use this skill

- Condition 1
- Condition 2

## When not to use this skill

- Route-out 1 → use `other-skill`
- Route-out 2 → use `other-skill`

## Instructions

[Core instructions here]
```

## Quality checklist

- [ ] Description is under 1024 characters
- [ ] Description includes "Use when [context]" trigger language
- [ ] SKILL.md is under 100 lines (or has justified split)
- [ ] When-not-to-use routes out to specific skills
- [ ] metadata.tags covers discoverable keywords
- [ ] No implementation details in the description (that's what the body is for)
