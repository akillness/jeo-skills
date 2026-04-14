# Automation and Source of Truth

## Source-of-truth priority
When changelog input sources disagree, prefer this order unless the repo clearly documents a different policy:

1. merged release PR / tagged release notes
2. merged PRs included in the release
3. linked issues or milestone notes
4. commit history
5. draft planning docs

Do not treat draft roadmap or TODO items as shipped changes.

## Automation lanes

### Release Drafter
Good for:
- PR-label grouping
- release-draft generation
- consistent headings

Still requires:
- wording cleanup
- audience fit
- migration / deprecation review
- doc-link hygiene

### Changesets
Good for:
- package versioning
- monorepo release notes
- per-package change intent

Still requires:
- deciding what belongs in customer-facing notes
- linking to migration/user guides
- filtering internal-only package noise

### release-please
Good for:
- release PRs
- version bumps
- conventional-commit driven summaries

Still requires:
- accurate breaking-change framing
- explicit route-outs for tutorials, API docs, and migrations
- readability review for non-engineer audiences

## Practical writing rule
Automation can propose categories and bullets.
Humans/agents still decide:
- the primary audience
- what is notable
- what needs a migration link
- what belongs in a separate guide

## Game/live-ops note
Steam patch-note workflows favor lightweight title + description style update posts.
Do not overload that artifact with build, deployment, or campaign detail.
