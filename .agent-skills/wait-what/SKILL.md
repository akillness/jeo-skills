---
name: wait-what
description: >
  Stop. That last message did not land: re-pitch it. Use when the previous answer did not land and
  needs re-pitching in plain language. Triggers on: wait what, I don't follow, re-pitch that.
allowed-tools: Read Grep Glob
compatibility: >
  A one-shot recovery trigger when the last message did not land. Route sustained audience-level
  explanation to eli5 and teaching sessions to teach.
metadata:
  tags: re-pitch, simplified-technical-english, ubiquitous-language, confusion-recovery, context-md
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
  upstream_commit: 3cca18b368ae95cdbdebbff572ccafa662551015
  invocation: user-invoked
---

# Wait, What?

Stop. That last message did not land: re-pitch it. Use when the previous answer did not land and needs re-pitching in plain language. Triggers on: wait what, I don't follow, re-pitch that.

This skill is imported from `mattpocock/skills` (MIT) and is **user-invoked** upstream.

## When to use this skill

- Stop.
- That last message did not land: re-pitch it.
- Use when the previous answer did not land and needs re-pitching in plain language.
- Triggers on: wait what, I don't follow, re-pitch that.

## Instructions

Wait, I don't understand where you've got to here. Re-pitch that: give me a little bit of context, talk in ASD-STE100 Simplified Technical English, and use the ubiquitous language from `CONTEXT.md` (follow `CONTEXT-MAP.md` to the right one if the repo has more than one).

## Examples

- Apply this skill to one narrow scope first, confirm the output matches the shape described above, then widen to the full task.
- When a step needs a fact from the repository or the environment, look it up instead of asking the user for it.

## Best practices

- Keep the upstream procedure intact; record deviations explicitly instead of silently improvising.
- Stop and hand control back to the user at every decision point this skill marks as theirs.
- Prefer small reversible changes, and state assumptions rather than burying them.

## References

- Upstream skill: `mattpocock/skills` `skills/productivity/wait-what/SKILL.md` (commit `3cca18b`, MIT)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
