---
name: to-issues
description: Use this skill when >
  Convert plans, specs, or requirements into independently-grabbable vertical slice
  issues. Each slice is a thin but complete end-to-end cut through all layers
  (schema, API, UI, tests). Classifies issues as HITL (human-in-the-loop) or AFK
  (automated, no human interaction needed).
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Works with GitHub Issues, Linear, or any issue tracker. Run setup-matt-pocock-skills
  first to configure tracker location and label vocabulary. Pairs with to-prd for
  requirements and triage for issue state management.
metadata:
  tags: issues, planning, vertical-slices, decomposition, project-management, tickets
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# To Issues

Convert plans and specs into independently-actionable vertical slice issues.

## When to use this skill

- Breaking down a plan or PRD into implementation tickets
- Decomposing a feature into parallel work items
- Preparing work for AI agents (AFK) or human developers (HITL)

## When not to use this skill

- Creating a PRD from scratch → use `to-prd`
- Evaluating/categorizing existing issues → use `triage`
- Planning without implementation tickets → use `task-planning`

## Core principle: vertical slices

Each slice is a **narrow but COMPLETE path through every layer**: schema, API, UI, tests. Completed slices are independently demoable.

❌ Horizontal: "Add all database tables" → "Add all API endpoints" → "Add all UI components"
✅ Vertical: "User can create a task" (schema + API + UI + tests, end-to-end)

## Issue types

- **HITL** — requires human interaction: architectural decisions, design review, external access, manual testing
- **AFK** — implementable and mergeable without human input (preferred when possible)

## Process

### 1. Gather context

Read the plan from the conversation or fetch referenced issues. Understand the full scope before decomposing.

### 2. Explore the codebase

Use the project's domain glossary (CONTEXT.md) and vocabulary when naming issues. Understand current state to avoid redundant work.

### 3. Draft vertical slices

- Each slice = one independently-completable unit of user-facing value
- Each slice cuts through all relevant layers
- Order by dependency (what must exist before what)
- Label HITL or AFK

### 4. Quiz the user

Before publishing, confirm:
- Are the slices the right granularity? (Too big = hard to estimate; too small = churn)
- Are dependencies correctly ordered?
- Any slices that should be merged or split?
- Any HITL/AFK classifications to change?

### 5. Publish to tracker

Publish in dependency order. Use the standard issue template:

```markdown
## Context

[Brief description of what this slice delivers and why it matters]

## Acceptance Criteria

- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]

## Implementation Notes

[Key decisions, constraints, or approach hints if known]

## Type

HITL | AFK
```

Add appropriate labels: category (`bug`/`enhancement`) + state (`needs-triage` or `ready-for-agent`/`ready-for-human`).

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
