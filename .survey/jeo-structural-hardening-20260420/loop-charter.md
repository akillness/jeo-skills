# Loop Charter

## Goal
Improve `jeo` so it activates more precisely as the integrated orchestration front door, routes adjacent work more honestly, and stays easier to maintain across Claude/Codex/Gemini/OpenCode.

## Current Baseline
`jeo` is a strong but oversized front-door skill (288 lines) with broad trigger language and a long procedural body. The current best version already owns the `.jeo` ledger, plan gate, runtime handoff, QA verification, and cleanup, but it likely mixes routing, platform setup, and lifecycle detail more than necessary.

## Mutable Artifact
Primary: `/Users/jang_jennie/projects/oh-my-skills/.agent-skills/jeo/SKILL.md`
Supporting context only if the main ratchet wins: `references/`, `evals/evals.json`, `SKILL.toon`, README.md, README.ko.md, setup-all-skills-prompt.md, `.agent-skills/skills.json`, `.agent-skills/skills.toon`, survey artifacts, wiki pages, graph outputs.

## Fixed Evaluation Harness
- Agent Skills spec / `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/jeo`
- Catalog sync / `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`
- JSON validity for any changed machine-readable files
- Dry-run rubric: sharper trigger precision, honest route-outs to `ralph`, `plannotator`, `agent-browser`, `agentation`, `omc`, `omx`, `ohmg`, `bmad`, and `ralphmode`, plus a more reusable output packet for integrated orchestration asks

## Constraints
- One bounded improvement set only; no duplicate orchestration skill creation
- Prefer moving detail into references over expanding `SKILL.md`
- Keep docs/setup surfaces synced if discovery wording changes materially
- Update graph/wiki only if the ratchet holds

## Tried Already
- Keep: previous `jeo` modernization and structural hardening work already established `.jeo` ledger and plan/execute/verify/cleanup ownership
- Revert: adding another orchestration wrapper or blurring `jeo` with runtime-native skills would create overlap and noise
