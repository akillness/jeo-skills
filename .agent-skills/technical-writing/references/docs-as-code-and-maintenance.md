# Docs-as-Code and Maintenance Notes

## Why this matters
Write the Docs frames docs-as-code as using the same tools and workflows as software development. In practice that means internal technical docs should behave like maintained artifacts, not one-off prose dumps.

## Practical rules
1. Keep docs close to the system they describe when possible.
2. Prefer reviewable Markdown or text formats over opaque binaries for technical docs.
3. Record dates, status, and owners for decision-heavy documents.
4. Link to source-of-truth code, dashboards, or commands instead of copying volatile details everywhere.
5. Update the doc when a rollout, runbook, or migration path changes materially.

## Good patterns by mode
- **Spec**: version alongside the implementation branch or proposal directory.
- **Architecture doc**: keep higher-level than code comments, but revisit after major topology changes.
- **ADR**: one file per decision; immutable record plus follow-up links works better than silent rewrite.
- **Runbook**: optimize for incident scanning; short sections beat dense narrative.
- **Migration guide**: keep preconditions and validation checkpoints near the step list.

## Maintenance triggers
Refresh the document when:
- the implementation plan changed materially
- operational commands or owners changed
- a migration gained new compatibility constraints
- an ADR was superseded by a later decision
- the document keeps being explained verbally because the written version is too vague

## Anti-patterns
- giant catch-all docs that combine tutorial, reference, marketing, and ops content
- stale commands with no verification note
- copying API portal content into an internal spec instead of linking it
- hiding rollback or escalation details at the bottom of a long narrative
