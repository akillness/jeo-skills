# Loop Charter

## Goal
Improve the existing `steam-store-launch-ops` skill so it behaves like a shorter packet-first Steam launch router with sharper route-outs and clearer one-shot readiness constraints.

## Current Baseline
Current best version is `.agent-skills/steam-store-launch-ops/SKILL.md` at the latest `main` branch state. It already has a good bottleneck model and support coverage, but the front door remains oversized and still blends packet choice, examples, and route-out detail more than the repo's newer packet-first anchors.

## Mutable Artifact
Primary mutable artifact: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/steam-store-launch-ops/SKILL.md`

Supporting artifacts allowed only if the primary ratchet holds:
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/steam-store-launch-ops/references/intake-packets-and-route-outs.md`
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/steam-store-launch-ops/evals/evals.json`
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/steam-store-launch-ops/SKILL.toon`
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/skills.json`
- `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/skills.toon`
- `/Users/jang_jennie/projects/oh-my-skills/README.md`
- `/Users/jang_jennie/projects/oh-my-skills/README.ko.md`
- `/Users/jang_jennie/projects/oh-my-skills/setup-all-skills-prompt.md`

## Fixed Evaluation Harness
- Survey evidence in `.survey/steam-store-launch-ops-structural-hardening-20260420/`
- Agent Skills spec requirements
- Repo validator: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- JSON validity checks for `evals/evals.json` and `.agent-skills/skills.json`
- Discovery-surface sync check by reading README / README.ko / setup prompt / `skills.json` / `skills.toon`
- Dry-run rubric:
  1. Description remains trigger-sharp and Steam-bounded.
  2. Main skill body gets shorter or structurally cleaner.
  3. Packet types and route-outs become more explicit.
  4. Demo / Next Fest one-shot timing constraints become harder to miss.
  5. No duplicate skill is created.

## Constraints
- Max one skill lane this run.
- Prefer one meaningful structural change over multiple unrelated edits.
- No new skill unless the survey proves a real catalog gap.
- Keep changes repo-truthful and source-backed.
- Preserve the game-cluster boundary with `marketing-automation`, `game-demo-feedback-triage`, `game-build-log-triage`, and `game-performance-profiler`.

## Tried Already
- Keep: 2026-04-17 bottleneck-router hardening added the five-bucket diagnosis model, support refs, and eval coverage.
- Revert: adding another Steam/game-marketing wrapper was rejected because the repo already had the right owner.
- Why: the durable gap is front-door shape and route-out clarity, not missing category coverage.
