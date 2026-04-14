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
- Tutorials / FAQs moved to `user-guide-writing`
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
