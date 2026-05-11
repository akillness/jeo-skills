# Open PR Carry-Forward Blocker Playbook

Use this playbook when the hourly run starts with one or more open PRs and `gh pr checks` reports no checks.

## Goal
Keep development cadence without creating duplicate PRs, while producing deterministic blocker artifacts and remediation guidance.

## Preconditions
- Target repository has at least one open PR.
- Current run is unattended (cron).
- Merge gates require green checks.

## Deterministic sequence
1. Capture open PR inventory into the active survey slug:
   - `.survey/<slug>/open-prs.json`
2. Capture checks output to temporary files in the same slug:
   - `checks.out.tmp`, `checks.err.tmp`
3. Normalize checks artifacts with collector:
   - produce `open-pr-checks.out`, `open-pr-checks.err`, `open-pr-checks-summary.json`
4. Build health snapshots:
   - `open-pr-health.json`, `open-pr-health.md`
5. Generate CI bootstrap readiness:
   - `ci-bootstrap-readiness.json`
6. Generate blocker bundle for reviewer-facing comment body:
   - `open-pr-blocker.json`, `open-pr-blocker.md`
7. Post blocker comment using `--body-file`.

## Required blocker payload fields
- PR number and URL
- active branch
- current commit SHA
- merge blocked reason (`no-checks-reported`)
- remediation checklist for CI bootstrap

## Minimum remediation checklist
- Add a PR-triggered GitHub Actions workflow on default branch.
- Ensure branch protection requires at least one required check.
- Re-run checks on the active PR branch after workflow is visible.
- Confirm `gh pr checks` returns concrete check rows before merge attempt.

## Packaging hygiene
- Keep temp capture files under `.survey/<slug>/` only.
- Delete `*.tmp` files before `git add`.
- Ensure `git status --short` is clean before `gh pr create` or run completion.

## Provenance labels for markdown artifacts
Use validator-accepted labels in text where evidence is cited:
- direct page retrieval
- browser-rendered retrieval
- indexed snippet
- thin evidence
