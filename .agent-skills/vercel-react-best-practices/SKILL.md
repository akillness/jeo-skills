---
name: vercel-react-best-practices
description: >
  Compatibility alias for `react-best-practices`. Use when an existing workflow,
  setup script, or user explicitly asks for `vercel-react-best-practices`; route
  general React and Next.js performance work to `react-best-practices` instead.
  Triggers on: legacy skill name, Vercel React best practices alias, exact-folder
  compatibility.
allowed-tools: Read Write Edit
license: MIT
metadata:
  tags: React, Next.js, performance, optimization, vercel, alias, compatibility
  platforms: Claude, ChatGPT, Gemini
  author: vercel
  version: "1.1.0"
---

# Vercel React Best Practices

This skill is a compatibility wrapper around `react-best-practices`. It exists so older workflows and platform-specific setups can keep working without making the React performance lane look like two equally preferred default skills.

## When to use this skill

- A user or tool explicitly asks for `vercel-react-best-practices`
- A setup or sync process expects the legacy folder/name to exist
- You need to preserve backward compatibility while routing the real work to `react-best-practices`

Do **not** choose this skill as the default for general React or Next.js performance help.

## Instructions

### Step 1: Confirm alias intent
Check whether the request truly depends on the exact alias name.

Use this alias only when:
- the user names it directly
- a script/tooling surface references it literally
- a migration or compatibility concern is part of the task

Otherwise, switch to `../react-best-practices/SKILL.md`.

### Step 2: Redirect to the canonical skill
Use the alias-side packet first, then jump to the canonical React performance guidance:
- Alias routing notes: `./references/alias-routing.md`
- Measurement + route-out notes: `./references/measurement-route-outs.md`
- Canonical skill: `../react-best-practices/SKILL.md`
- Deep reference: `../react-best-practices/AGENTS.md`
- Nearby boundaries:
  - `../state-management/SKILL.md` for global state architecture
  - `../web-accessibility/SKILL.md` for accessibility remediation
  - `../performance-optimization/SKILL.md` for non-React-wide performance problems

### Step 3: Preserve compatibility in outputs
If you were activated via the alias name, mention that the canonical guidance now lives in `react-best-practices` so future maintenance converges on one primary entry.

## Examples

### Example 1: explicit legacy-name request
Input: "Use `vercel-react-best-practices` to audit our slow Next.js dashboard."
Output: Acknowledge the alias, then apply the canonical `react-best-practices` guidance for waterfalls, bundle size, and RSC boundaries.

### Example 2: general React performance question
Input: "Our React app rerenders too much and the Next.js page is slow."
Output: Do **not** stay in the alias. Route to `react-best-practices` directly.

## Best practices

1. Treat this as a redirect layer, not an independent knowledge base.
2. Keep trigger wording narrow so the canonical skill wins ordinary React/Next.js requests.
3. When updating the underlying guidance, update `react-best-practices` first.
4. Keep docs/setup surfaces explicit about canonical-vs-compatibility status.

## References

- `./references/alias-routing.md`
- `./references/measurement-route-outs.md`
- `../react-best-practices/SKILL.md`
- `../react-best-practices/AGENTS.md`
- `../state-management/SKILL.md`
- `../web-accessibility/SKILL.md`
- `../performance-optimization/SKILL.md`
