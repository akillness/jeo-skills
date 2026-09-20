# Release Note Quality Checklist

Use this checklist before finalizing changelog or release-note output.

## Accuracy
- Every claim matches shipped or merged evidence
- Version number / release scope is correct
- Breaking changes, removals, or deprecations are explicit
- Migration links point to real docs

## Readability
- No raw ticket dumps or commit-log phrasing
- Audience-facing notes use plain language
- Entries are short and scannable
- Sections are grouped logically

## Boundary discipline
- Deep technical explanation moved to `technical-writing` or `api-documentation`
- Tutorials / FAQs moved to `technical-writing`
- Rollout mechanics moved to `deployment-automation`
- Campaign-style copy moved to `marketing-automation`

## Trust
- No claims about GA / rollout completeness without proof
- No “various improvements” filler if specifics are available
- Known limitations or next steps are called out when material

## Good section labels
- `Added`
- `Changed`
- `Deprecated`
- `Removed`
- `Fixed`
- `Security`
- `What’s new`
- `Improvements`
- `Breaking changes`
- `Known issues`

## Smells that need rewriting
- “Misc updates”
- “Bug fixes and improvements” with no specifics
- internal ticket IDs as the first thing the reader sees
- more than one audience being served equally badly in the same artifact
- migration steps hidden inside a long prose paragraph

## Technical → user-facing rewrites (merged from the former `release-notes` skill, 2026-09-19)
Lead with the benefit, drop jargon, codenames, and ticket numbers, keep each entry to 1-3
sentences, and match the product's voice (professional for B2B, friendly for consumer,
precise for developer audiences).

| Technical source | User-facing entry |
|---|---|
| Implemented Redis caching layer for dashboard API endpoints | Dashboards now load up to 3× faster, so you spend less time waiting and more time analyzing. |
| Fixed race condition in concurrent checkout flow | Fixed an issue where some orders could fail during high-traffic periods. |
| Migrated auth to OIDC; legacy API keys removed | **Action required:** API keys stop working on <date>. Switch to OIDC tokens — see the migration guide. |

Input material for this rewrite is usually a ticket export (Jira, Linear), a PRD, a Git
log, or an internal changelog; read all of it first, then extract per change *what
changed*, *who it affects*, and *why it matters* before writing a single entry.
