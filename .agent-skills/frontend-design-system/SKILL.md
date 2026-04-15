---
name: frontend-design-system
description: >
  Compatibility alias for `design-system`. Use when an existing workflow, setup
  script, or user explicitly asks for `frontend-design-system`; route ordinary UI
  system, design-token, landing-page, dashboard, and component-library work to
  `design-system` instead. Triggers on: legacy skill name, frontend-design-system
  alias, exact-folder compatibility, migration-safe UI system routing.
allowed-tools: Read Write Edit
metadata:
  tags: frontend, design, ui, ux, design-tokens, alias, compatibility
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.1.0"
---

# Frontend Design System

This skill is a compatibility wrapper around `design-system`. It exists so older workflows and exact-name integrations can keep working without making the frontend UI-system lane look like two equally preferred default skills.

## When to use this skill

- A user or tool explicitly asks for `frontend-design-system`
- A setup, sync, or migration process expects the legacy folder/name to exist
- You need backward compatibility while routing the real design-system work to `design-system`

Do **not** choose this skill as the default for general UI-system design work.

## Instructions

### Step 1: Confirm alias intent
Use this alias only when the exact legacy name matters.

Good reasons:
- the user names `frontend-design-system` directly
- a script or platform references the folder/name literally
- you are preserving compatibility during a migration or cleanup pass

Otherwise, switch to `../design-system/SKILL.md`.

### Step 2: Redirect to the canonical skill
Use the alias-side packet first, then jump to the canonical skill for substantive UI-system work:
- Alias routing notes: `./references/alias-routing.md`
- Compact/discovery sync notes: `./references/compact-surface-sync.md`
- Canonical skill: `../design-system/SKILL.md`
- Boundary notes: `../design-system/references/scope-boundaries.md`
- Nearby skills:
  - `../ui-component-patterns/SKILL.md` for implementation-level component patterns
  - `../responsive-design/SKILL.md` for device-adaptation work
  - `../web-accessibility/SKILL.md` for accessibility audits/remediation

### Step 3: Preserve compatibility in outputs
If activated through the alias name, mention that the canonical guidance now lives in `design-system` so future maintenance converges on one primary entry.

## Examples

### Example 1: explicit legacy-name request
Input: "Use `frontend-design-system` to shape the UI system for our SaaS dashboard."
Output: Acknowledge the alias, then apply the canonical `design-system` guidance for tokens, layout hierarchy, motion rules, and accessibility.

### Example 2: general UI-system question
Input: "We need a design system for a landing page and dashboard that share components."
Output: Do **not** stay in the alias. Route to `design-system` directly.

## Best practices

1. Treat this as a redirect layer, not an independent knowledge base.
2. Keep trigger wording narrow so `design-system` wins ordinary prompts.
3. Update the canonical skill first whenever the underlying UI-system guidance changes.
4. Keep README/setup/manifest surfaces explicit about canonical-vs-compatibility status.

## References

- `./references/alias-routing.md`
- `./references/compact-surface-sync.md`
- `../design-system/SKILL.md`
- `../design-system/references/scope-boundaries.md`
- `../ui-component-patterns/SKILL.md`
- `../responsive-design/SKILL.md`
- `../web-accessibility/SKILL.md`
