---
name: zoom-out
description: Use this skill when >
  Request a broader architectural perspective when navigating unfamiliar code sections.
  Maps all relevant modules, identifies caller relationships and dependencies, and
  uses domain-specific vocabulary. Use when encountering unfamiliar code or needing
  to understand how a component integrates with the larger system.
allowed-tools: Read Grep Glob
compatibility: >
  Works across all codebases. Most useful when CONTEXT.md domain vocabulary is
  available. Pairs with improve-codebase-architecture for deeper analysis and
  codebase-search for targeted navigation.
metadata:
  tags: architecture, navigation, context, modules, codebase-understanding, orientation
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# Zoom Out

Get a higher-level architectural perspective on unfamiliar code sections.

## When to use this skill

- Navigating unfamiliar code and needing to understand how it connects to the larger system
- Before making changes to understand the blast radius
- When you need a module map before diving into implementation

## When not to use this skill

- Finding specific symbols or patterns → use `codebase-search`
- Architectural improvement opportunities → use `improve-codebase-architecture`
- Debugging a specific failure → use `debugging`

## What zoom-out produces

A structural map showing:
- All relevant modules in the area of interest
- Caller relationships (what calls what)
- Key dependencies (what depends on what)
- Domain vocabulary from CONTEXT.md applied to module names

## How to use

When you encounter unfamiliar code, ask for a zoom-out before diving in:

> "Zoom out and give me a broader view of how [module/component] fits into the system."

The response will map the relevant modules using the project's domain glossary, not internal implementation names.

## Output format

```
[Module A] → calls → [Module B], [Module C]
[Module B] ← called by → [Module A], [Module D]

Key seams:
- [Interface X] separates [Domain Concept 1] from [Domain Concept 2]
- [Interface Y] is where [Domain Concept 3] behavior can be swapped

Domain terms in use here:
- "Order" = [what it means in this context]
- "Customer" = [what it means in this context]
```

## Note on invocation

This skill sets `disable-model-invocation: true` — it is a directive framework that instructs the agent how to respond, not an independent processing unit. Invoke it as a behavioral directive when exploring code.

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
