# Loop Charter

## Goal
Improve the practical usability of `.agent-skills/game-performance-profiler` by shrinking the front door into a cleaner routing-first contract without weakening its benchmark-route, device-review, or escalation guidance.

## Current Baseline
- `game-performance-profiler/SKILL.md` is 296 lines and appears on `graphify-out/GRAPH_REPORT.md` as an oversized front-door candidate.
- Support coverage already exists: `references/`, `evals/evals.json`, and `SKILL.toon` are present.
- Discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `skills.json`, `skills.toon`) already mention the skill but should stay truthful if the trigger surface changes.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/game-performance-profiler/SKILL.md`

Supporting artifacts allowed only if needed to preserve clarity after shrinking the front door:
- `.agent-skills/game-performance-profiler/references/*`
- `.agent-skills/game-performance-profiler/evals/evals.json`
- `.agent-skills/game-performance-profiler/SKILL.toon`
- repo discovery surfaces (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`)
- survey/wiki/graph outputs documenting the decision

## Fixed Evaluation Harness
- Agent Skills spec expectations from `skill-standardization`
- Trigger quality: skill should activate for Unity/Unreal frame-time complaints, profiler/stat screenshot interpretation, benchmark-route requests, and Steam Deck/device-review packets without overreaching into build-log or generic optimization work
- Structural target: front door should become materially smaller while preserving explicit route-outs and one clear output contract
- Support symmetry: if `SKILL.md` meaning changes, sync `SKILL.toon`, evals, and discovery surfaces
- Validation prompts: existing 4 eval prompts plus one route-out boundary case if the boundary wording changes

## Constraints
- One bounded structural change set this run; do not create a new adjacent game-performance skill
- Keep the skill deterministic and routing-first rather than turning it into a generic optimization essay
- Max one new support reference unless required
- Preserve repo conventions and existing cluster boundaries with `performance-optimization`, `game-build-log-triage`, `game-demo-feedback-triage`, and `game-ci-cd-pipeline`
- Validate changed skill files and JSON before PR work

## Tried Already
- Keep: the 2026-04-15 modernization pass that established quick-triage, bottleneck-classification, benchmark-route, device-review, and tool-escalation modes
- Keep: existing support references for packet capture, device review, escalation ladder, and profiling patterns
- Revert: adding a Steam Deck-only or generic performance wrapper (rejected in prior survey/wiki findings)
- Why: the durable gap is front-door density and discovery truthfulness, not missing catalog coverage
