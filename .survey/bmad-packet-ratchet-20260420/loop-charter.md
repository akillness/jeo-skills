# Loop Charter

## Goal
Improve the existing `bmad` skill with one bounded, transferable ratchet: tighten it into a packet-first BMAD front door that chooses one primary intake packet and routes runtime / review / task / game-production detail outward earlier.

## Current Baseline
Current best version: `.agent-skills/bmad/SKILL.md` on `main` after the 2026-04-15 modernization.
Current quality: good vendor-neutral phase router with references/evals/support, but still more phase-centric than the surrounding packet-first anchors.

## Mutable Artifact
Primary: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/bmad/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec and repo conventions from `skill-standardization`
- Existing `bmad` role: portable BMAD/BMM front door, not runtime-specific orchestration
- Validation prompts: current `evals/evals.json` plus at least one new packet-boundary case
- Repo sync surfaces when trigger/discovery wording changes: `SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`
- Acceptance threshold: clearer trigger surface, one-packet-first contract, honest route-outs, and passing skill/catalog validation

## Constraints
- Keep the change bounded to one meaningful contract ratchet, not a new wrapper skill
- Do not rewrite neighboring skill ownership
- Prefer moving detail into `references/` over re-expanding the main trigger surface
- Maintain or improve eval coverage
- Keep survey and wiki artifacts append-only / additive

## Tried Already
- Keep: 2026-04-15 modernization into a portable BMAD/BMM core router
- Revert: adding another BMAD-adjacent wrapper or mixing runtime-specific orchestration into the common layer
- Why: repo pattern favors narrow front doors plus explicit route-outs and support files
