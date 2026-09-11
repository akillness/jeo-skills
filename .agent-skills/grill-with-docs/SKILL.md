---
name: grill-with-docs
description: >
  A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary)
  as we go. Use when the grilling session should also leave ADRs and glossary entries behind.
  Triggers on: grill with docs, grill and document, grill this and write the ADR.
allowed-tools: Read Grep Glob Bash Write Edit Task
compatibility: >
  Thin user-invoked entry point that pairs grilling with domain-modeling so ADRs and glossary
  entries land during the session.
metadata:
  tags: plan-review, adr, glossary, grilling-entrypoint, domain-modeling
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
  upstream_commit: 3cca18b368ae95cdbdebbff572ccafa662551015
  invocation: user-invoked
---

# Grill with Docs

A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go. Use when the grilling session should also leave ADRs and glossary entries behind. Triggers on: grill with docs, grill and document, grill this and write the ADR.

This skill is imported from `mattpocock/skills` (MIT) and is **user-invoked** upstream.

## When to use this skill

- A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
- Use when the grilling session should also leave ADRs and glossary entries behind.
- Triggers on: grill with docs, grill and document, grill this and write the ADR.

## Instructions

Call the Skill tool twice, for "grilling" and "domain-modeling".

## Examples

- Apply this skill to one narrow scope first, confirm the output matches the shape described above, then widen to the full task.
- When a step needs a fact from the repository or the environment, look it up instead of asking the user for it.

## Best practices

- Keep the upstream procedure intact; record deviations explicitly instead of silently improvising.
- Stop and hand control back to the user at every decision point this skill marks as theirs.
- Prefer small reversible changes, and state assumptions rather than burying them.

## References

- Upstream skill: `mattpocock/skills` `skills/engineering/grill-with-docs/SKILL.md` (commit `3cca18b`, MIT)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
