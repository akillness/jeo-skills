---
name: agent-development-principles
description: >
  Compatibility alias for `agent-principles`. Use when an existing workflow,
  install surface, or exact-name request still references
  `agent-development-principles`; the substantive collaboration-principles work
  should route to `agent-principles`. Triggers on: legacy
  agent-development-principles, old install docs, exact-name compatibility.
allowed-tools: Read Write Bash Grep Glob
metadata:
  tags: agentic-development, principles, context-management, automation, ai-collaboration, universal
  platforms: Claude, ChatGPT, Gemini
  version: 1.1.0
  source: Claude Code Complete Guide - 70 tips (ykdojo + Ado Kukic), generalized
---

# Agentic Development Principles Alias

This skill remains only for compatibility with older docs, installs, and
exact-name references.

## When to use this skill

- The user explicitly asks for `agent-development-principles`
- A legacy install script, README, or workflow still depends on this exact name
- You need to preserve backward compatibility while routing real work to the
  canonical principles skill

## Instructions

### Step 1: Recognize this as a legacy alias

- Treat `agent-development-principles` as a compatibility surface, not the
  default principles skill.
- Keep the answer short and route the substantive work to `agent-principles`.

### Step 2: Preserve exact-name compatibility

- If a README, install command, or older workflow explicitly names this skill,
  acknowledge the exact-name match and continue without breaking the flow.
- Do not expand this alias into a second peer principles guide.

### Step 3: Route to the canonical skill

- Use `agent-principles` for the real collaboration-principles guidance.
- Keep this alias narrow so the catalog has one default skill for this job.

## Examples

### Example 1: Exact-name request

Input:
```text
Use agent-development-principles to explain how I should collaborate with AI agents.
```

Output shape:
- acknowledges the legacy skill name
- routes the substantive answer to `agent-principles`
- keeps compatibility intact without duplicating the whole guide

## Best practices

- Keep compatibility aliases narrow and explicit
- Preserve old install surfaces without letting the alias compete as a peer default
- Update discovery copy so maintainers know which skill is canonical

## References

- [../agent-principles/SKILL.md](../agent-principles/SKILL.md)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [ykdojo claude-code-tips](https://github.com/ykdojo/claude-code-tips)
- [Ado's Advent of Claude](https://adocomplete.com/advent-of-claude-2025/)
