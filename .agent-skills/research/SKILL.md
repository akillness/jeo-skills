---
name: research
description: >
  Investigate a question against high-trust primary sources and capture the findings as a Markdown
  file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or
  reading legwork delegated to a background agent.
allowed-tools: Read Grep Glob Bash Write Task
compatibility: >
  Produces one cited Markdown findings file in the repo. Route multi-agent report pipelines to
  deep-research and landscape scans to survey.
metadata:
  tags: primary-sources, background-agent, citation, docs-research, findings-file
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
  upstream_commit: 3cca18b368ae95cdbdebbff572ccafa662551015
  invocation: model-invoked
---

# Research to Markdown

Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.

This skill is imported from `mattpocock/skills` (MIT) and is **model-invoked** upstream.

## When to use this skill

- Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo.
- Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.

## Instructions

Spin up a **background agent** to do the research, so you keep working while it reads.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.

## Examples

- Apply this skill to one narrow scope first, confirm the output matches the shape described above, then widen to the full task.
- When a step needs a fact from the repository or the environment, look it up instead of asking the user for it.

## Best practices

- Keep the upstream procedure intact; record deviations explicitly instead of silently improvising.
- Stop and hand control back to the user at every decision point this skill marks as theirs.
- Prefer small reversible changes, and state assumptions rather than burying them.

## References

- Upstream skill: `mattpocock/skills` `skills/engineering/research/SKILL.md` (commit `3cca18b`, MIT)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`
- Validator script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
