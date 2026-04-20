# Signal tiers and promotion lanes

Use this reference when `game-ci-cd-pipeline` needs to say **which lane owns the current pain** before choosing the packet.

## 1. `branch-gate`
Use when the question is about **fast merge/commit validation**.

Typical signs:
- PR or push builds are too slow
- full Android/iOS/console packaging runs on every branch
- developers do not trust CI because the feedback arrives too late
- the team needs a cheaper compile/test/smoke lane before heavier packaging

Bias toward:
- `ci-signal-hardening`
- `stage-split`
- sometimes `cache-policy`

Anti-pattern:
- treating every merge like a release candidate just because packaging exists

## 2. `nightly-package-candidate`
Use when the team needs **heavier QA/review/demo builds** that should not block every merge.

Typical signs:
- scheduled or manually triggered packaging
- nightly Windows/macOS/Steam Deck or multi-platform candidate builds
- QA/review teams need clearer artifact names, retention, and handoff rules
- broader target coverage is desired, but only after fast branch CI passes

Bias toward:
- `artifact-release`
- `pipeline-setup`
- `stage-split`
- `preflight-readiness`

Anti-pattern:
- hiding nightly/demo candidate work inside the same branch gate and calling it "CI trust"

## 3. `release-certification-candidate`
Use when the team is dealing with **signed, approval-heavy, store-bound, or certification-bound candidates**.

Typical signs:
- stricter approvals or protected environments
- signing/provisioning/publisher requirements
- console/store/cert packaging with long retention and explicit promotion rules
- the branch/nightly lane already exists, but release-candidate truth is still manual

Bias toward:
- `artifact-release`
- `preflight-readiness`
- `pipeline-setup`

Route-outs:
- `testing-strategies` when the real argument is which checks block promotion
- `steam-store-launch-ops` when the remaining work is public launch/store readiness rather than engine pipeline mechanics

## Lane-selection checklist
1. What triggers this lane now — PR/push, schedule/manual, or protected release flow?
2. Who consumes the output — developers, QA/review, publishing/release, or certification stakeholders?
3. Which outputs need the longest retention or strictest naming?
4. Which failures are allowed to be slow, and which must stay fast?
5. Which parts still happen manually after CI finishes?

## Durable rule
Choose the signal tier first. Then choose the smallest honest packet inside that tier.
