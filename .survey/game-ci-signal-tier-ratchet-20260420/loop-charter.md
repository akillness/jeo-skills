# Loop Charter

## Goal
Improve `game-ci-cd-pipeline` so it tells the truth about signal tier / promotion lane before choosing the next pipeline packet.

## Current Baseline
The current best version (2026-04-19 structural hardening) chooses one useful packet type and keeps single-log triage routed out, but it still lets branch-gate CI, nightly/package-candidate work, and release/certification candidate work blur together too easily.

## Mutable Artifact
Primary mutable artifact: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/game-ci-cd-pipeline/SKILL.md`

Supporting surfaces allowed only if the primary change is kept:
- `SKILL.toon`
- `references/intake-packets-and-route-outs.md`
- `evals/evals.json`
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki/log/query artifacts

## Fixed Evaluation Harness
- Agent Skills spec / repo conventions enforced by `skill-standardization`
- Existing game-cluster boundary: `game-build-log-triage` owns single failing logs, `steam-store-launch-ops` owns public launch/store operations, `bmad-gds` owns milestone coordination, `testing-strategies` owns release-gate policy selection
- Validation prompts:
  1. "Our PR pipeline takes 70 minutes because Android packaging runs on every branch. What should change first?"
  2. "We already have a quick branch build, but QA needs a nightly Windows + Steam Deck candidate with clear artifact names."
  3. "We are preparing a signed console release candidate and need stricter approvals than our normal CI lane."
- Pass threshold:
  - The skill must classify one signal tier before or alongside packet routing.
  - It must preserve the existing packet-first contract and not grow a new wrapper skill.
  - It must keep `game-build-log-triage`, `steam-store-launch-ops`, and `testing-strategies` boundaries explicit.
  - Discovery surfaces must stay truthful and compact.

## Constraints
- Bounded ratchet only: signal-tier / promotion-lane truth, not a full game CI rewrite.
- No new overlapping game DevOps skill.
- Keep the front door compact; move durable detail into references.
- Prefer transferable guidance across Unity, Unreal, GitHub Actions, managed build services, and self-hosted runners.

## Tried Already
- Keep: packet-first routing, structural-vs-log boundary, engine-specific notes, and one next artifact
- Revert: adding separate Unity/Unreal CI wrappers or treating all build/release workflows as one lane
- Why: the missing truth is lane classification, not another skill or a broader tool list
