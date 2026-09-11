---
name: implement
description: >
  Implement a piece of work based on a spec or set of tickets. Use when an agreed spec or ticket
  set should now be built. Triggers on: implement, build this spec, work these tickets.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Executes an already-agreed spec or ticket set. Route slicing to to-tickets, delivery lifecycle
  policy to agentic-skills, and long autonomous loops to ralph.
metadata:
  tags: implementation, spec-execution, ticket-execution, tdd-seams, commit-flow
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
  upstream_commit: 3cca18b368ae95cdbdebbff572ccafa662551015
  invocation: user-invoked
---

# Implement

Implement a piece of work based on a spec or set of tickets. Use when an agreed spec or ticket set should now be built. Triggers on: implement, build this spec, work these tickets.

This skill is imported from `mattpocock/skills` (MIT) and is **user-invoked** upstream.

## When to use this skill

- Implement a piece of work based on a spec or set of tickets.
- Use when an agreed spec or ticket set should now be built.
- Triggers on: implement, build this spec, work these tickets.

## Instructions

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit your work to the current branch.

## Examples

- Apply this skill to one narrow scope first, confirm the output matches the shape described above, then widen to the full task.
- When a step needs a fact from the repository or the environment, look it up instead of asking the user for it.

## Best practices

- Keep the upstream procedure intact; record deviations explicitly instead of silently improvising.
- Stop and hand control back to the user at every decision point this skill marks as theirs.
- Prefer small reversible changes, and state assumptions rather than burying them.

## References

- Upstream skill: `mattpocock/skills` `skills/engineering/implement/SKILL.md` (commit `3cca18b`, MIT)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
