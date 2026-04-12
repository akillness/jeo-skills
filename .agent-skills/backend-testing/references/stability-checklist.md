# Backend Test Stability Checklist

Use this checklist when `backend-testing` is asked to stabilize a flaky or slow suite.

## Failure-signal checklist
- Capture failing request/response payloads or contract diffs when safe.
- Capture container logs, service logs, and migration output for CI-only failures.
- Record whether the failure is local-only, CI-only, or both.
- Note whether rerun changes the outcome. If yes, treat it as a trust issue, not a harmless annoyance.

## Data / environment checklist
- Is test data seeded explicitly, or does the suite rely on leftovers?
- Is time controlled where expiry, retries, or scheduling matter?
- Are random IDs / UUIDs / ordering assumptions making assertions fragile?
- Are background jobs, queues, or async workers actually awaited?
- Are containers or dependent services ready before tests start?

## Scope checklist
- Can some coverage move from smoke/E2E down into unit, integration, or contract tests?
- Is the suite proving one release-critical journey or trying to prove everything?
- Are auth/bootstrap helpers centralized, or copied into every test file?
- Are retries or quarantines temporary mitigations with an owner, or permanent hiding places?

## Delivery checklist
- Define the fast local path separately from the authoritative CI path.
- Document what runs on PRs vs nightly/release.
- Leave future maintainers a short note on fixtures, reset strategy, and dependency choices.
- If the suite remains intentionally brittle because of a shared external environment, say so explicitly.
