---
name: to-prd
description: Use this skill when >
  Generate a structured Product Requirements Document (PRD) from existing conversation
  context and codebase state. Synthesizes knowledge into a PRD without interviewing
  the user. Use when documenting requirements for a feature or change to publish
  to the project issue tracker.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Works with any issue tracker. Run setup-matt-pocock-skills first to configure
  tracker location and triage label vocabulary. Pairs with to-issues for
  decomposition and triage for state management.
metadata:
  tags: prd, requirements, product, documentation, planning, user-stories
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# To PRD

Convert current conversation context into a structured PRD for publication to the project issue tracker.

## When to use this skill

- Documenting requirements from existing discussion
- Creating a formal spec before breaking work into issues
- Recording architectural decisions alongside user stories

## When not to use this skill

- Breaking work into tickets → use `to-issues`
- Writing technical internal docs → use `technical-writing`
- Quick task notes → use `task-planning`

## Process

### 1. Explore and understand

Review the codebase using the project's domain vocabulary (CONTEXT.md) and relevant ADRs. Do not interview the user — synthesize from existing context.

### 2. Design modules

Identify the major components to build or modify. Emphasize **deep modules**: simple, testable interfaces with stable contracts. Validate assumptions with the user and confirm which modules need test coverage.

### 3. Document and publish

Complete the PRD template and submit to the issue tracker with the `needs-triage` label.

## PRD template

```markdown
# [Feature/Change Name]

## Problem Statement

[User-facing description of the issue or opportunity. What pain does this solve?]

## Solution

[User-facing description of the resolution approach.]

## User Stories

1. As a [actor], I want [feature], so that [benefit].
2. As a [actor], I want [feature], so that [benefit].
[... comprehensive list covering all use cases]

## Implementation Decisions

### Modules

[Major components to build/modify with interface descriptions]

### Technical Choices

[Architecture decisions, schema design, API contracts — avoid file paths and code snippets]

### ADR References

[Links to relevant Architecture Decision Records]

## Testing Decisions

[Testing philosophy for this feature, which modules need coverage, relevant test precedents]

## Out of Scope

- [Explicitly excluded item]
- [Explicitly excluded item]

## Further Notes

[Additional context, open questions, or dependencies]
```

## Quality checklist

- [ ] Problem statement is user-facing (not technical)
- [ ] User stories cover all actors and use cases
- [ ] Implementation decisions reference existing domain vocabulary
- [ ] Out of scope section prevents scope creep
- [ ] No file paths or code in the PRD (these belong in issues)

## Instructions
1. Identify the task trigger and expected output.
2. Follow the workflow steps in this skill from top to bottom.
3. Validate outputs before moving to the next step.
4. Capture blockers and fallback path if any step fails.

## Examples
- Example: Apply this skill to a small scope first, then scale to full scope after validation passes.

## Best practices
- Keep outputs deterministic and auditable.
- Prefer small reversible changes over broad risky edits.
- Record assumptions explicitly.

## References
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
