# Frontend design-system compact-surface sync

The alias folder must stay aligned across all discovery surfaces:
- `SKILL.md`
- `SKILL.toon`
- `.agent-skills/skills.json`
- top-level docs surfaces when wording changes materially

## Compact-surface rule
`frontend-design-system` should always be described as a compatibility alias for `design-system`.

Never describe it as:
- the default frontend design-system skill
- a peer canonical alternative to `design-system`
- a standalone UI-system knowledge base

## Sync checklist
- Does `SKILL.toon` explicitly say “compatibility alias” or equivalent narrow wording?
- Does the compact description tell ordinary design-system work to go to `design-system`?
- Does `skills.json` still match the same canonical-vs-alias story?
- If README / README.ko / setup prompt changed earlier, do they still reflect the same boundary?

## Expected neighboring boundaries
- `design-system` owns general UI-system direction
- `ui-component-patterns` owns implementation-level reusable component APIs
- `responsive-design` owns device/layout adaptation
- `web-accessibility` owns accessibility remediation and audits

If any surface makes `frontend-design-system` sound like the main skill again, treat it as derived-artifact drift and fix it in the same change set.
