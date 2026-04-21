# Rollout and Rollback Checklist

Use this checklist when producing a deployment packet.

## 1. Preflight
- Artifact/build source is named explicitly
- Target environment is named explicitly
- Required auth/config already exists
- Current deploy command or provider action is known
- Blocking migrations/stateful risks are named
- Same-artifact-promotion vs rebuild-per-env is identified

## 2. Rollout strategy
Choose the smallest safe strategy:
- direct replace
- rolling update
- blue/green
- canary
- progressive delivery
- feature-flag-assisted release

Questions:
- What is the blast radius if this deploy is bad?
- Do we have trustworthy health checks or smoke checks?
- Do we need human approval before production?
- Can we switch traffic back quickly?

## 3. Verification
Minimum acceptable verification after deploy:
- health endpoint or equivalent availability signal
- one smoke test proving the core user flow still works
- provider/runtime release status check
- explicit note on who signs off or what auto-stops promotion

Optional higher-confidence verification:
- synthetic checks
- release KPI checks
- canary analysis
- queue/worker health checks
- manual business-critical path review

## 4. Rollback
Always name the real rollback method:
- redeploy previous artifact/image
- provider rollback / previous release restore
- traffic switchback
- feature-flag disable
- manual recovery runbook

Always name what rollback does **not** solve automatically:
- schema/data compatibility
- irreversible migrations
- emitted events/side effects
- cache invalidation or stale clients

## 5. Output requirements
A good deployment packet should always include:
- rollout mode
- environment and artifact
- preconditions
- steps
- verification
- rollback
- handoffs / remaining risks
