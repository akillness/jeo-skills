---
name: marketing-skills-collection
description: >
  Compatibility alias for `marketing-automation`. Use when an existing prompt,
  setup surface, workflow, or legacy catalog entry explicitly references
  `marketing-skills-collection` but the real need is still broad product or growth
  marketing routing across CRO, copywriting, SEO, lifecycle messaging, analytics,
  pricing, launches, retention, and experiments. Prefer `marketing-automation`
  for canonical general use. Triggers on: marketing-skills-collection, legacy
  marketing skill name, old marketing prompt pack, migrate marketing alias.
allowed-tools: Write Read WebSearch WebFetch Task
metadata:
  tags: marketing, automation, alias, compatibility
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
---

> **Note:** This skill is a compatibility wrapper for `marketing-automation`. Use it when the environment still references the legacy name, but execute the same routing logic and produce the same packet shape as the canonical skill.

# Marketing Skills Collection

## When to use this skill
- A legacy prompt, installed catalog, or setup surface still calls `marketing-skills-collection`
- The real task is still a broad marketing-routing request rather than a niche specialist workflow
- The safest behavior is to preserve backward compatibility while steering users toward the canonical name

## When not to use this skill
- The user can already adopt `marketing-automation` directly
- The request is actually a niche workflow with a stronger dedicated skill
- The task is game-specific Steam/store-page or festival launch operations → prefer `steam-store-launch-ops`

## Instructions

### Step 1: Resolve to the canonical skill
Immediately map this alias to `marketing-automation`.

### Step 2: Preserve the legacy reference in the response
If helpful, note that `marketing-skills-collection` is a legacy-compatible alias for `marketing-automation`.

### Step 3: Use the smallest alias support packet that answers the question
Start with the focused alias support docs before opening the full canonical skill:
- `references/alias-resolution-checklist.md` — when to preserve the old name, how to announce the mapping, and what not to change
- `references/legacy-intake-and-route-outs.md` — how to translate legacy asks into the canonical brief and when to route out to `steam-store-launch-ops` or other specialists
- `../marketing-automation/SKILL.md` — only when the task needs the full canonical routing flow

### Step 4: Run the canonical routing flow
Use the same process as `marketing-automation`:
1. normalize the marketing brief,
2. choose one primary lane,
3. return one implementation-ready packet,
4. include KPI, handoff, and measurement logic.

### Step 5: Keep route-outs explicit
If the request is really game-store / wishlist / Steam festival launch work, or another clearly narrower specialist workflow, preserve the alias note but route execution to the stronger specialist skill instead of forcing the general marketing router to absorb it.

### Step 6: Avoid drifting into a second independent skill
Do not invent different heuristics, deliverables, sub-skill inventories, or a separate discovery story here. This alias exists to reduce migration friction, not to become a competing general marketing skill.

## Output format
Return the same **Marketing Routing Brief** used by `marketing-automation`.

## Examples

### Example 1: legacy prompt pack
**Input**
> Use marketing-skills-collection to help me decide what to do with our signup funnel and onboarding emails.

**Expected behavior**
- Briefly note that the legacy name maps to `marketing-automation`
- Choose one primary lane for the current packet
- Return a canonical Marketing Routing Brief

### Example 2: migration-safe usage
**Input**
> Our team docs still mention marketing-skills-collection. Can you use it for this launch brief?

**Expected behavior**
- Treat the request as valid
- Execute the canonical marketing-routing workflow
- Prefer `marketing-automation` in any forward-looking recommendation

## Best practices
1. Keep the alias lightweight and explicit.
2. Preserve backward compatibility without duplicating the full canonical instructions.
3. Nudge future usage toward `marketing-automation` whenever discovery wording matters.

## References
- `references/alias-resolution-checklist.md`
- `references/legacy-intake-and-route-outs.md`
- `../marketing-automation/SKILL.md`
- `../steam-store-launch-ops/SKILL.md`
