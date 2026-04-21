# Gate Truth and Release Handovers

Use this note when the core ambiguity is **which gate is really being shaped** rather than which test type sounds sophisticated.

## 1. Merge gate truth
Use this when the team is deciding what must block a PR or merge queue.

Typical signals:
- protected branches or required status checks are in play
- reviewers are asking what is mandatory before approval
- flaky or slow suites are slowing merges

Good output:
- one explicit blocking set
- one explicitly informational set
- one scheduled/non-blocking follow-up set if needed

Reminder:
GitHub protected-branch rules enforce the blocking subset; they do not define the whole validation strategy for you.

## 2. Release gate truth
Use this when tests are mostly green but the remaining risk is rollout, launch, permissions, packaging, migrations, or human signoff.

Typical signals:
- staging smoke or rollback proof is missing
- deployment/runbook sequencing matters more than another unit test
- store/platform release checklists still have open items
- the team is asking “is this actually ready to ship?” rather than “can we merge?”

Good output:
- narrow release-only proof
- named launch/deploy owner
- explicit statement that PR blockers should not grow just because launch work remains

Typical handoffs:
- `deployment-automation` for rollout execution, rollback steps, post-deploy verification order, and release runbooks
- `steam-store-launch-ops` for Steam release checklist, store page, launch timing, or launch-ops proof
- `game-ci-cd-pipeline` for engine/build pipeline implementation or stabilization when the remaining work is pipeline-owned

## 3. Scheduled breadth truth
Use this when the useful coverage is real but too expensive, flaky, or broad to block every change.

Typical signals:
- matrix combinations, browser/device sweeps, or compatibility passes
- long-running data/job scenarios
- quarantine candidates that still need visibility

Good output:
- scheduled cadence
- ownership for follow-up
- explicit reason the suite is non-blocking

## 4. Quick tests for the boundary
Ask these questions:
1. If this evidence failed, should the PR be blocked right now?
2. If the answer is no, is the evidence release-only or scheduled-breadth proof?
3. If the remaining proof is platform/store/deploy execution, is `testing-strategies` still the owner?

If questions 2 or 3 dominate, route out.

## 5. Anti-patterns
- Expanding merge blockers because launch work exists elsewhere.
- Treating “required status checks” as proof that the right checks were chosen.
- Keeping flaky broad suites in PR gates just because no one named a scheduled owner.
- Using release checklists as a vague bucket instead of tying them to one remaining risk.
