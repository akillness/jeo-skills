# Open PR Head Containment Verification

Use this guard in hourly carry-forward mode after pushing commits to an existing open PR branch.

## Why
In unattended runs, another automation/job may push to the same branch between your local commit and final reporting. If you report a local SHA without verifying remote containment, blocker comments and run reports can reference stale commits.

## Deterministic procedure
1. Capture the local head SHA you intend to deliver.
2. Fetch remote branch tip.
3. Verify local SHA is ancestor of `origin/<branch>`.
4. If false, record both SHAs and use current remote head SHA in blocker/report artifacts.
5. Re-run verification if you make additional local commits later in the same run.

## Commands
```bash
git fetch origin <branch>
LOCAL_SHA=$(git rev-parse HEAD)
REMOTE_SHA=$(git rev-parse origin/<branch>)
if git merge-base --is-ancestor "$LOCAL_SHA" "origin/<branch>"; then
  echo "containment=pass"
else
  echo "containment=drift"
fi
```

## Reusable script
Use:
```bash
python3 .agent-skills/survey/scripts/check_remote_branch_contains_commit.py \
  <owner/repo> <branch> <local_sha> .survey/<slug>/post-push-containment.json
```

Output should include:
- `status`: `pass|drift|error`
- `local_commit`
- `remote_head`
- `merge_blocked_reason` when drift is detected

## Reporting requirement
When status is `drift`, blocker comment/report must reference `remote_head` (not stale local SHA) and include remediation: rebase/replay and re-push before merge attempt.
