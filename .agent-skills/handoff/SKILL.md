---
name: handoff
description: >
  Compact the current conversation into a handoff document for another agent to pick up. Use when
  the user says handoff, is running out of context, or wants a fresh agent to pick the work up.
  Triggers on: handoff, hand this off, compact this conversation.
allowed-tools: Read Grep Glob Write
compatibility: >
  Writes a throwaway handoff file to the OS temp directory. Route durable project memory to
  opencontext and committed knowledge bases to llm-wiki.
metadata:
  tags: session-handoff, context-compaction, agent-continuity, redaction, suggested-skills
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
  upstream_commit: 3cca18b368ae95cdbdebbff572ccafa662551015
  invocation: user-invoked
---

# Handoff Document

Compact the current conversation into a handoff document for another agent to pick up. Use when the user says handoff, is running out of context, or wants a fresh agent to pick the work up. Triggers on: handoff, hand this off, compact this conversation.

This skill is imported from `mattpocock/skills` (MIT) and is **user-invoked** upstream.

## When to use this skill

- Compact the current conversation into a handoff document for another agent to pick up.
- Use when the user says handoff, is running out of context, or wants a fresh agent to pick the work up.
- Triggers on: handoff, hand this off, compact this conversation.

## Instructions

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save to the temporary directory of the user's OS - not the current workspace.

Include a "suggested skills" section in the document, naming which skills the next agent should call the Skill tool for.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

## Examples

- Apply this skill to one narrow scope first, confirm the output matches the shape described above, then widen to the full task.
- When a step needs a fact from the repository or the environment, look it up instead of asking the user for it.

## Best practices

- Keep the upstream procedure intact; record deviations explicitly instead of silently improvising.
- Stop and hand control back to the user at every decision point this skill marks as theirs.
- Prefer small reversible changes, and state assumptions rather than burying them.

## References

- Upstream skill: `mattpocock/skills` `skills/productivity/handoff/SKILL.md` (commit `3cca18b`, MIT)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
