---
name: grill-me
description: >
  A relentless interview to sharpen a plan or design. Use when the user wants a plan or design
  stress-tested. Triggers on: grill me, grill this, stress-test my plan.
allowed-tools: Read Grep Glob Bash Task
compatibility: >
  Thin user-invoked entry point. The procedure lives in grilling; use grill-with-docs when domain
  docs should be written during the session.
metadata:
  tags: plan-review, stress-testing, grilling-entrypoint, design-tree, user-invoked
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
  upstream_commit: 3cca18b368ae95cdbdebbff572ccafa662551015
  invocation: user-invoked
---

# Grill Me

A relentless interview to sharpen a plan or design. Use when the user wants a plan or design stress-tested. Triggers on: grill me, grill this, stress-test my plan.

This skill is imported from `mattpocock/skills` (MIT) and is **user-invoked** upstream.

## When to use this skill

- A relentless interview to sharpen a plan or design.
- Use when the user wants a plan or design stress-tested.
- Triggers on: grill me, grill this, stress-test my plan.

## Instructions

Call the Skill tool with "grilling".

## Examples

- Apply this skill to one narrow scope first, confirm the output matches the shape described above, then widen to the full task.
- When a step needs a fact from the repository or the environment, look it up instead of asking the user for it.

## Best practices

- Keep the upstream procedure intact; record deviations explicitly instead of silently improvising.
- Stop and hand control back to the user at every decision point this skill marks as theirs.
- Prefer small reversible changes, and state assumptions rather than burying them.

## References

- Upstream skill: `mattpocock/skills` `skills/productivity/grill-me/SKILL.md` (commit `3cca18b`, MIT)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
