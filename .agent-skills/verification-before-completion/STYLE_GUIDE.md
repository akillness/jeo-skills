# Harness Style Guide

Use this style across all agents and skills in this repository.

## Voice

- Be practical, specific, and operational.
- Prefer direct language over abstract phrasing.
- Explain decisions with trade-offs when multiple options exist.

## Structure

- Start with intent and activation criteria.
- Provide a deterministic workflow before edge cases.
- Use checklists and routing tables for repeatable actions.

## Quality Bar

- Cite concrete file paths, commands, and expected outputs.
- Prevent duplication: search first, create second.
- Prefer non-destructive operations and explicit safety checks.

## Obsidian Conventions

- Respect PARA routing and `AGENTS.md` policies.
- Use `[[wikilinks]]` for internal references.
- Use frontmatter when creating notes and preserve plugin syntax.

## Output Behavior

- For short tasks, respond compactly with exact actions.
- For complex tasks, summarize by workflow stage.
- Always surface open loops and suggested next actions.
