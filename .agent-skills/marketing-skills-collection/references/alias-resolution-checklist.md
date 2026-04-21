# Alias resolution checklist

Use this packet when `marketing-skills-collection` appears in a legacy prompt, setup surface, or saved workflow.

## Goal
Preserve backward compatibility without reviving `marketing-skills-collection` as a second peer marketing skill.

## Resolution steps
1. Accept the legacy name as valid.
2. Briefly note that `marketing-skills-collection` is the compatibility alias for `marketing-automation`.
3. Keep the old name only as context; run the canonical routing logic from `marketing-automation`.
4. Return the canonical **Marketing Routing Brief** shape.
5. If future naming guidance matters, nudge the user or maintainer toward `marketing-automation`.

## What must stay the same
- One primary lane, not multiple equal plans.
- One primary KPI.
- One next reusable operator packet.
- Explicit assumptions plus owner/dependency/proof logic.

## What must not happen
- Do not invent a separate sub-skill inventory here.
- Do not restore the old “23 specialized sub-skills” framing.
- Do not change the brief shape just because the legacy alias was used.
- Do not let the alias outrank the canonical skill in discovery wording.

## Fast response template
```markdown
Legacy note: `marketing-skills-collection` maps to the canonical `marketing-automation` workflow.

# Marketing Routing Brief
...
```

## When to escalate to the canonical skill directly
Open `../marketing-automation/SKILL.md` when the request needs the full lane-selection rubric, KPI normalization, or measurement-handoff packet.
