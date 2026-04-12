# Loop Charter

## Goal
Create one high-utility, reusable game-engine performance profiling skill that helps agents turn Unity/Unreal performance complaints into a deterministic triage brief.

## Current Baseline
Repository has generic performance and game build log skills, but no dedicated cross-engine profiling/performance triage skill.

## Mutable Artifact
Primary: `.agent-skills/game-performance-profiler/SKILL.md`

## Fixed Evaluation Harness
- Agent Skills spec conventions from skill-standardization
- Survey artifacts in `.survey/game-engine-performance-profiling/`
- Dry-run prompts:
  1. "Our Unity game drops from 120 to 45 fps in combat. We have Profiler screenshots and suspect GC spikes."
  2. "Unreal build is fine but frame time blows up in an open world area. How do we triage whether it is CPU, GPU, streaming, or shaders?"
  3. "We need a Steam Deck performance review plan before demo release."
- Rubric:
  - clear trigger precision
  - deterministic step order
  - engine-specific profiling language
  - output format points to a next artifact/checklist
  - transferable across Unity and Unreal

## Constraints
- One primary skill artifact only; supporting files allowed
- Keep changes bounded to one coherent opportunity area
- Prefer practical workflows over encyclopedic optimization theory
- Add supporting files only if they materially improve reuse or validation

## Tried Already
- Keep: none yet
- Revert: none yet
- Why: new run
